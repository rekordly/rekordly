import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth/server';
import { convertToSalesSchema } from '@/lib/validations/invoice';
import { generateReceiptNumber, toTwoDecimals } from '@/lib/fn';

const prisma = new PrismaClient();

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

    const body = await request.json();
    const validationResult = convertToSalesSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: 'Validation failed',
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const amountPaid = toTwoDecimals(data.amountPaid);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId,
      },
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

    if (!invoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404 }
      );
    }

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

      // ✅ Calculate new amounts with 2 decimal places
      const newBalance = toTwoDecimals(existingBalance - amountPaid);
      const newTotalPaid = toTwoDecimals(existingAmountPaid + amountPaid);
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

      const result = await prisma.$transaction(async tx => {
        await tx.payment.create({
          data: {
            saleId: invoice.sale!.id,
            amount: amountPaid,
            paymentMethod: data.paymentMethod,
            reference: data.reference,
            notes: data.notes,
            paymentDate: data.paymentDate
              ? new Date(data.paymentDate)
              : new Date(),
          },
        });

        const updatedSale = await tx.sale.update({
          where: { id: invoice.sale!.id },
          data: {
            amountPaid: newTotalPaid,
            balance: newBalance,
            status: newStatus,
          },
        });

        if (newBalance === 0) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'PAID',
            },
          });
        }

        return { sale: updatedSale };
      });

      return NextResponse.json(
        {
          message: 'Payment added successfully',
          success: true,
          sale: result.sale,
        },
        { status: 200 }
      );
    }

    const invoiceTotalAmount = toTwoDecimals(invoice.totalAmount);

    if (amountPaid > invoiceTotalAmount) {
      return NextResponse.json(
        { message: 'Amount paid cannot exceed total amount' },
        { status: 400 }
      );
    }

    // Generate unique receipt number
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

    const invoiceStatus = balance === 0 ? 'PAID' : 'CONVERTED';

    const processedItems = processItems(invoice.items);

    const invoiceAmount = toTwoDecimals(invoice.amount);
    const invoiceVatAmount = toTwoDecimals(invoice.vatAmount);
    const invoiceTotal = toTwoDecimals(invoice.totalAmount);

    const result = await prisma.$transaction(async tx => {
      // Create sale
      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          userId,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          customerName: invoice.customerId ? null : invoice.customerName,
          customerEmail: invoice.customerId ? null : invoice.customerEmail,
          customerPhone: invoice.customerId ? null : invoice.customerPhone,
          title: invoice.title,
          description: invoice.description,
          includeVAT: invoice.includeVAT,
          items: processedItems,
          amount: invoiceAmount,
          vatAmount: invoiceVatAmount,
          totalAmount: invoiceTotal,
          amountPaid: amountPaid,
          balance: balance,
          status: saleStatus,
          saleDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        },
      });

      // Create payment record
      await tx.payment.create({
        data: {
          saleId: sale.id,
          amount: amountPaid,
          paymentMethod: data.paymentMethod,
          reference: data.reference,
          notes: data.notes,
          paymentDate: data.paymentDate
            ? new Date(data.paymentDate)
            : new Date(),
        },
      });

      // ✅ Update invoice status based on payment
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          saleId: sale.id,
          status: invoiceStatus,
        },
      });

      return { sale, updatedInvoice };
    });

    return NextResponse.json(
      {
        message: 'Invoice converted to sale successfully',
        success: true,
        sale: result.sale,
        invoice: result.updatedInvoice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Convert invoice error:', error);

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
  } finally {
    await prisma.$disconnect();
  }
}
