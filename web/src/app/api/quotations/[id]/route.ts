import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

import { getAuthUser } from '@/lib/utils/server';
import { UpdateQuotationSchema } from '@/lib/validations/quotations';
import { validateRequest } from '@/lib/utils/validation';
import { resolveCustomer } from '@/lib/utils/customer';
import { toTwoDecimals } from '@/lib/fn';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const quotation = await prisma.quotation.findFirst({
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
        payments: {
          select: {
            id: true,
            quotationId: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            category: true,
            payableType: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { message: 'Quotation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        quotation,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get quotation error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingQuotation = await prisma.quotation.findFirst({
      where: { id, userId },
    });

    if (!existingQuotation) {
      return NextResponse.json(
        { message: 'Quotation not found' },
        { status: 404 }
      );
    }

    const data = await validateRequest(request, UpdateQuotationSchema);

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

    let customer = null;

    if (data.customer?.customerRole) {
      const resolvedCustomer = await resolveCustomer(
        userId,
        data.customer,
        data.addAsNewCustomer
      );
      customer = resolvedCustomer.customer;
    }

    // Process line items with proper decimal conversion if provided
    const lineItems = data.lineItems?.map(item => ({
      ...item,
      unitPrice: toTwoDecimals(item.unitPrice),
      amount: toTwoDecimals(item.amount),
    }));

    // Process other costs with proper decimal conversion if provided
    const otherCosts = data.otherCosts?.map(cost => ({
      ...cost,
      amount: toTwoDecimals(cost.amount),
    }));

    // Determine status based on payment if amounts are provided
    let status = data.status;
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

    // Prepare update data object
    const updateData: any = {};

    // Customer fields
    if (data.customer?.name !== undefined) {
      updateData.customerName = data.customer.name;
    }
    if (data.customer?.email !== undefined) {
      updateData.customerEmail = data.customer.email;
    }
    if (data.customer?.phone !== undefined) {
      updateData.customerPhone = data.customer.phone;
    }
    if (data.customer?.id !== undefined) {
      updateData.customerId = data.customer.id;
    }

    // Basic fields
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;

    // Date fields
    if (data.issueDate !== undefined) {
      updateData.issueDate = new Date(data.issueDate);
    }
    if (data.validUntil !== undefined) {
      updateData.validUntil = new Date(data.validUntil);
    }

    // Line items and pricing
    if (lineItems) updateData.lineItems = lineItems;
    if (data.subtotal !== undefined) {
      updateData.subtotal = toTwoDecimals(data.subtotal);
    }

    // Discount fields
    if (data.discountType !== undefined)
      updateData.discountType = data.discountType;
    if (data.discountValue !== undefined) {
      updateData.discountValue = toTwoDecimals(data.discountValue);
    }
    if (data.discountAmount !== undefined) {
      updateData.discountAmount = toTwoDecimals(data.discountAmount);
    }

    // Other costs
    if (otherCosts) updateData.otherCosts = otherCosts;

    // VAT
    if (data.includeVAT !== undefined) updateData.includeVAT = data.includeVAT;
    if (data.vatAmount !== undefined) {
      updateData.vatAmount = toTwoDecimals(data.vatAmount);
    }

    // Financial fields
    if (data.totalAmount !== undefined) {
      updateData.totalAmount = toTwoDecimals(data.totalAmount);
    }
    if (data.amountPaid !== undefined) {
      updateData.amountPaid = toTwoDecimals(data.amountPaid);
    }
    if (data.balance !== undefined) {
      updateData.balance = toTwoDecimals(data.balance);
    }

    // Status
    if (status !== undefined) updateData.status = status;

    // Update quotation
    const quotation = await prisma.quotation.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        payments: {
          select: {
            id: true,
            quotationId: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            category: true,
            payableType: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Quotation updated successfully',
        success: true,
        quotation,
        customer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update quotation error:', error);

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

// DELETE
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { userId } = await getAuthUser(request);

    const quotation = await prisma.quotation.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { message: 'Quotation not found' },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.payment.deleteMany({
        where: { quotationId: params.id },
      }),
      prisma.quotation.delete({
        where: { id: params.id },
      }),
    ]);

    return NextResponse.json(
      { message: 'Quotation deleted successfully', success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete quotation error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
