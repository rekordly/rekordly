import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { BaseSaleSchema, CreateSaleSchema } from '@/lib/validations/sales';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';

// PATCH /api/sales/[id] - Update sale
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id, userId },
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

    // Use partial schema for updates
    const updateSchema = BaseSaleSchema.partial();
    const data = await validateRequest(request, updateSchema);

    // Validate customer if provided and has an ID
    if (data.customer?.id) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customer.id,
          userId,
        },
      });

      if (!customer) {
        return NextResponse.json(
          { message: 'Customer not found or does not belong to you' },
          { status: 404 }
        );
      }
    }

    // Resolve customer only if customer data is provided
    let customer = null;
    if (data.customer?.customerRole) {
      const resolvedCustomer = await resolveCustomer(
        userId,
        data.customer,
        data.addAsNewCustomer
      );
      customer = resolvedCustomer.customer;
    }

    // Process items with proper decimal conversion if provided
    const items = data.items?.map(item => ({
      ...item,
      rate: toTwoDecimals(item.amount),
      amount: toTwoDecimals(item.amount),
    }));

    // Process other expenses with proper decimal conversion if provided
    const otherSaleExpenses = data.otherSaleExpenses?.map(expense => ({
      ...expense,
      amount: toTwoDecimals(expense.amount),
    }));

    // Determine status based on payment if amounts are provided
    let status = undefined;
    if (data.totalAmount !== undefined && data.amountPaid !== undefined) {
      const totalAmount = toTwoDecimals(data.totalAmount);
      const amountPaid = toTwoDecimals(data.amountPaid);

      if (amountPaid >= totalAmount) {
        status = 'PAID';
      } else if (amountPaid > 0) {
        status = 'PARTIALLY_PAID';
      } else {
        status = 'UNPAID';
      }
    }

    // Calculate payment difference if amountPaid is being updated
    const previousAmountPaid = existingSale.amountPaid;
    const newAmountPaid =
      data.amountPaid !== undefined
        ? toTwoDecimals(data.amountPaid)
        : previousAmountPaid;
    const paymentDifference = newAmountPaid - previousAmountPaid;

    const saleDate = data.saleDate ? new Date(data.saleDate) : undefined;

    // Update sale with transaction
    const result = await prisma.$transaction(async tx => {
      // Build update data object
      const updateData: any = {};

      if (data.sourceType !== undefined)
        updateData.sourceType = data.sourceType;
      if (data.invoiceId !== undefined) {
        updateData.invoiceId = data.invoiceId || null;
      }

      if (data.customer) {
        if (data.customer.id) {
          updateData.customerId = data.customer.id;
          updateData.customerName = null;
          updateData.customerEmail = null;
          updateData.customerPhone = null;
        } else {
          updateData.customerId = null;
          updateData.customerName = data.customer.name;
          updateData.customerEmail = data.customer.email || null;
          updateData.customerPhone = data.customer.phone || null;
        }
      }

      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) {
        updateData.description = data.description || null;
      }
      if (items) updateData.items = items;
      if (data.subtotal !== undefined) {
        updateData.subtotal = toTwoDecimals(data.subtotal);
      }
      if (data.discountType !== undefined) {
        updateData.discountType = data.discountType || null;
      }
      if (data.discountValue !== undefined) {
        updateData.discountValue = data.discountValue
          ? toTwoDecimals(data.discountValue)
          : null;
      }
      if (data.discountAmount !== undefined) {
        updateData.discountAmount = toTwoDecimals(data.discountAmount);
      }
      if (data.deliveryCost !== undefined) {
        updateData.deliveryCost = toTwoDecimals(data.deliveryCost);
      }
      if (otherSaleExpenses) updateData.otherSaleExpenses = otherSaleExpenses;
      if (data.totalSaleExpenses !== undefined) {
        updateData.totalSaleExpenses = toTwoDecimals(data.totalSaleExpenses);
      }
      if (data.includeVAT !== undefined)
        updateData.includeVAT = data.includeVAT;
      if (data.vatAmount !== undefined) {
        updateData.vatAmount = toTwoDecimals(data.vatAmount);
      }
      if (data.totalAmount !== undefined) {
        updateData.totalAmount = toTwoDecimals(data.totalAmount);
      }
      if (data.amountPaid !== undefined) {
        updateData.amountPaid = toTwoDecimals(data.amountPaid);
      }
      if (data.balance !== undefined) {
        updateData.balance = toTwoDecimals(data.balance);
      }
      if (status !== undefined) updateData.status = status;
      if (saleDate) updateData.saleDate = saleDate;

      // Update the sale
      const sale = await tx.sale.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
        },
      });

      // Handle payment changes only if amountPaid was updated
      let payment = null;
      if (data.amountPaid !== undefined && paymentDifference > 0) {
        // Additional payment made
        payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            saleId: sale.id,
            amount: toTwoDecimals(paymentDifference),
            paymentDate: saleDate || new Date(),
            paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
            category: 'INCOME',
            notes: `Additional payment for sale ${existingSale.receiptNumber}`,
          },
        });
      } else if (data.amountPaid !== undefined && paymentDifference < 0) {
        // Payment reduced - log it for now
        console.warn(`Payment reduced for sale ${id}: ${paymentDifference}`);
      }

      return { sale, payment };
    });

    return NextResponse.json(
      {
        message: 'Sale updated successfully',
        success: true,
        sale: result.sale,
        payment: result.payment,
        customer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update sale error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
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

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id, userId },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete sale (payments will be cascade deleted)
    await prisma.sale.delete({
      where: { id },
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

    const sale = await prisma.sale.findFirst({
      where: { id, userId },
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
