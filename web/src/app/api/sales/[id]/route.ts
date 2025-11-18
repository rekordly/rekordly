import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { CreateSaleSchema } from '@/lib/validations/sales';
import { toTwoDecimals } from '@/lib/fn';

// PATCH /api/sales/[id] - Update sale
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const saleId = id;

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
      include: {
        payments: true,
      },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = CreateSaleSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const { customerId, customerName, customerEmail, customerPhone } =
      await resolveCustomer(userId, data.customer, data.addAsNewCustomer);

    // Process items with proper decimal conversion
    const items = data.items.map(item => ({
      ...item,
      rate: toTwoDecimals(item.amount),
      amount: toTwoDecimals(item.amount),
    }));

    // Process other expenses with proper decimal conversion
    const otherSaleExpenses = (data.otherSaleExpenses || []).map(expense => ({
      ...expense,
      amount: toTwoDecimals(expense.amount),
    }));

    // Determine status based on payment
    let status: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID' = 'UNPAID';
    const totalAmount = toTwoDecimals(data.totalAmount);
    const amountPaid = toTwoDecimals(data.amountPaid || 0);
    const balance = toTwoDecimals(data.balance);

    if (amountPaid >= totalAmount) {
      status = 'PAID';
    } else if (amountPaid > 0) {
      status = 'PARTIALLY_PAID';
    }

    const saleDate = data.saleDate ? new Date(data.saleDate) : new Date();

    // Calculate payment difference
    const previousAmountPaid = existingSale.amountPaid;
    const paymentDifference = amountPaid - previousAmountPaid;

    // Update sale with transaction
    const result = await prisma.$transaction(async tx => {
      // Update the sale
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: {
          sourceType: data.sourceType || 'DIRECT',
          invoiceId: data.invoiceId || null,
          customerId,
          customerName,
          customerEmail,
          customerPhone,
          title: data.title,
          description: data.description || null,
          items,
          subtotal: toTwoDecimals(data.subtotal),
          discountType: data.discountType || null,
          discountValue: data.discountValue
            ? toTwoDecimals(data.discountValue)
            : null,
          discountAmount: toTwoDecimals(data.discountAmount || 0),
          deliveryCost: toTwoDecimals(data.deliveryCost || 0),
          otherSaleExpenses,
          totalSaleExpenses: toTwoDecimals(data.totalSaleExpenses || 0),
          includeVAT: data.includeVAT,
          vatAmount: toTwoDecimals(data.vatAmount || 0),
          totalAmount,
          amountPaid,
          balance,
          status,
          saleDate,
        },
      });

      // Handle payment changes
      let payment = null;
      if (paymentDifference > 0) {
        // Additional payment made
        payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            saleId: sale.id,
            amount: toTwoDecimals(paymentDifference),
            paymentDate: saleDate,
            paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
            category: 'INCOME',
            notes: `Additional payment for sale ${existingSale.receiptNumber}`,
          },
        });
      } else if (paymentDifference < 0) {
        // Payment reduced - you might want to handle refunds here
        // For now, we'll just log it
        console.warn(
          `Payment reduced for sale ${saleId}: ${paymentDifference}`
        );
      }

      return { sale, payment };
    });

    return NextResponse.json(
      {
        message: 'Sale updated successfully',
        success: true,
        sale: result.sale,
        payment: result.payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update sale error:', error);

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

// DELETE /api/sales/[id] - Delete sale
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const saleId = id;

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete sale (payments will be cascade deleted)
    await prisma.sale.delete({
      where: { id: saleId },
    });

    return NextResponse.json(
      {
        message: 'Sale deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete sale error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/sales/[id] - Get single sale
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const saleId = id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
          },
        },
        payments: {
          select: {
            id: true,
            saleId: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        sale,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get sale error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
