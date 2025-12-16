import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { baseQuotationSchema } from '@/lib/validations/quotations';
import { validateRequest } from '@/lib/utils/validation';
import { resolveCustomer } from '@/lib/utils/customer';

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
            saleId: true,
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

    const updateSchema = baseQuotationSchema.partial();
    const data = await validateRequest(request, updateSchema);

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

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        ...(data.customer && {
          customerId: data.customer.id || null,
          customerName: data.customer.id ? null : data.customer.name,
          customerEmail: data.customer.id ? null : data.customer.email,
          customerPhone: data.customer.id ? null : data.customer.phone,
        }),
        ...(data.quotationTitle !== undefined && {
          title: data.quotationTitle,
        }),
        ...(data.quotationDescription !== undefined && {
          description: data.quotationDescription,
        }),
        ...(data.materials && { materials: data.materials }),
        ...(data.materialsTotal !== undefined && {
          materialsTotal: data.materialsTotal,
        }),
        ...(data.workmanship !== undefined && {
          workmanship: data.workmanship,
        }),
        ...(data.otherCosts && { otherCosts: data.otherCosts }),
        ...(data.otherCostsTotal !== undefined && {
          otherCostsTotal: data.otherCostsTotal,
        }),
        ...(data.includeVAT !== undefined && { includeVAT: data.includeVAT }),
        ...(data.vatAmount !== undefined && { vatAmount: data.vatAmount }),
        ...(data.totalAmount !== undefined && {
          totalAmount: data.totalAmount,
        }),
        ...(data.balance !== undefined && { balance: data.balance }),
        ...(data.issueDate !== undefined && {
          issueDate: new Date(data.issueDate),
        }),
        ...(data.validUntil !== undefined && {
          validUntil: new Date(data.validUntil),
        }),
        ...(data.status !== undefined && {
          status: data.status,
        }),
      },
      include: {
        customer: true,
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
