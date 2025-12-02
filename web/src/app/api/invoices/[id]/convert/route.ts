import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { addPaymentSchema } from '@/lib/validations/general';
import { generateReceiptNumber, toTwoDecimals } from '@/lib/fn';
import { prisma } from '@/lib/prisma';
import { validateRequest } from '@/lib/utils/validation';

const processItems = (items: any): Prisma.InputJsonValue => {
  if (!items) return items;

  if (Array.isArray(items)) {
    return items.map((item: any) => ({
      ...item,
      price: toTwoDecimals(item.price || 0),
      amount: toTwoDecimals(item.amount || 0),
    }));
  }

  return items;
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, addPaymentSchema);
    const amountPaid = toTwoDecimals(data.amountPaid);

    // ✅ Fetch invoice with minimal data first (outside transaction)
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: {
        id: true,
        userId: true,
        customerId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        title: true,
        description: true,
        includeVAT: true,
        items: true,
        amount: true,
        vatAmount: true,
        totalAmount: true,
        sale: {
          select: {
            id: true,
            amountPaid: true,
            balance: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404 }
      );
    }

    // If invoice already has a sale, add payment to existing sale
    if (invoice.sale) {
      const existingBalance = toTwoDecimals(invoice.sale.balance);
      const existingAmountPaid = toTwoDecimals(invoice.sale.amountPaid);

      if (existingBalance === 0) {
        return NextResponse.json(
          { message: 'Invoice is already fully paid' },
          { status: 400 }
        );
      }

      if (amountPaid > existingBalance) {
        return NextResponse.json(
          { message: 'Amount paid cannot exceed remaining balance' },
          { status: 400 }
        );
      }

      const newBalance = toTwoDecimals(existingBalance - amountPaid);
      const newTotalPaid = toTwoDecimals(existingAmountPaid + amountPaid);
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';
      const paymentDate = data.paymentDate
        ? new Date(data.paymentDate)
        : new Date();

      // ✅ Optimized transaction with increased timeout
      await prisma.$transaction(
        async tx => {
          // Create payment record
          await tx.payment.create({
            data: {
              userId,
              payableType: 'SALE',
              category: 'INCOME',
              saleId: invoice.sale!.id,
              amount: amountPaid,
              paymentMethod: data.paymentMethod,
              reference: data.reference || null,
              notes: data.notes || null,
              paymentDate,
            },
          });

          // Update sale
          await tx.sale.update({
            where: { id: invoice.sale!.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
          });

          // Update invoice status if fully paid (without includes)
          if (newBalance === 0) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: 'CONVERTED',
              },
            });
          }
        },
        {
          maxWait: 10000, // 10 seconds
          timeout: 10000, // 10 seconds
        }
      );

      // ✅ Fetch updated invoice OUTSIDE transaction
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          sale: {
            select: {
              id: true,
              amountPaid: true,
              balance: true,
            },
          },
        },
      });

      return NextResponse.json(
        {
          message: 'Payment added successfully',
          success: true,
          invoice: updatedInvoice,
        },
        { status: 200 }
      );
    }

    // Create new sale from invoice
    const invoiceTotalAmount = toTwoDecimals(invoice.totalAmount);

    if (amountPaid > invoiceTotalAmount) {
      return NextResponse.json(
        { message: 'Amount paid cannot exceed total amount' },
        { status: 400 }
      );
    }

    // ✅ Generate receipt number OUTSIDE transaction
    let receiptNumber = generateReceiptNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.sale.findUnique({
        where: { receiptNumber },
      });

      if (!existing) break;
      receiptNumber = generateReceiptNumber(userId);
      attempts++;
    }

    const balance = toTwoDecimals(invoiceTotalAmount - amountPaid);
    const saleStatus =
      balance === 0
        ? 'PAID'
        : balance < invoiceTotalAmount
          ? 'PARTIALLY_PAID'
          : 'UNPAID';

    const processedItems = processItems(invoice.items);
    const invoiceSubtotal = toTwoDecimals(invoice.amount);
    const invoiceVatAmount = toTwoDecimals(invoice.vatAmount || 0);
    const invoiceTotal = toTwoDecimals(invoice.totalAmount);
    const paymentDate = data.paymentDate
      ? new Date(data.paymentDate)
      : new Date();

    // ✅ Optimized transaction with increased timeout
    const saleId = await prisma.$transaction(
      async tx => {
        // Create sale
        const sale = await tx.sale.create({
          data: {
            receiptNumber,
            userId,
            sourceType: 'FROM_INVOICE',
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            customerName: invoice.customerId ? null : invoice.customerName,
            customerEmail: invoice.customerId ? null : invoice.customerEmail,
            customerPhone: invoice.customerId ? null : invoice.customerPhone,
            title: invoice.title,
            description: invoice.description,
            includeVAT: invoice.includeVAT,
            items: processedItems,
            subtotal: invoiceSubtotal,
            vatAmount: invoiceVatAmount,
            totalAmount: invoiceTotal,
            amountPaid: amountPaid,
            balance: balance,
            status: saleStatus,
            saleDate: paymentDate,
          },
        });

        // Create payment record
        await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            category: 'INCOME',
            saleId: sale.id,
            amount: amountPaid,
            paymentMethod: data.paymentMethod,
            reference: data.reference || null,
            notes: data.notes || null,
            paymentDate,
          },
        });

        // Update invoice status (without includes)
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            saleId: sale.id,
            status: 'CONVERTED',
          },
        });

        return sale.id;
      },
      {
        maxWait: 10000, // 10 seconds
        timeout: 10000, // 10 seconds
      }
    );

    // ✅ Fetch complete invoice OUTSIDE transaction
    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        customer: true,
        sale: {
          select: {
            id: true,
            amountPaid: true,
            balance: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Invoice converted to sale successfully',
        success: true,
        invoice: updatedInvoice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Convert invoice error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Validation error', errors: error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
