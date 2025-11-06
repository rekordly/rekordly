import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getAuthUser } from '@/lib/utils/server';
import { baseQuotationSchema } from '@/lib/validations/quotations';

const prisma = new PrismaClient();

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
  } finally {
    await prisma.$disconnect();
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

    const body = await request.json();

    const updateSchema = baseQuotationSchema.partial();
    const validationResult = updateSchema.safeParse(body);

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
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update quotation error:', error);

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

// DELETE
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { userId } = await getAuthUser(request);
    console.log(params);

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

    // Don't allow deleting invoices that have been converted to sales
    // if (invoice.saleId) {
    //   return NextResponse.json(
    //     { message: 'Cannot delete invoice that has been converted to sale' },
    //     { status: 400 }
    //   );
    // }

    await prisma.$transaction([
      prisma.payment.deleteMany({
        where: { quotationId: params.id },
      }),
      prisma.quotation.delete({
        where: { id: params.id },
      }),
      prisma.incomeRecord.deleteMany({
        where: { sourceId: params.id },
      }),
    ]);

    return NextResponse.json(
      { message: 'Quotation deleted successfully', success: true },
      { status: 200 }
    );

    return NextResponse.json(
      {
        message: 'Quotation deleted successfully',
        success: true,
      },
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
  } finally {
    await prisma.$disconnect();
  }
}
