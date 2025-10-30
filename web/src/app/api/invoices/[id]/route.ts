import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth/server';
import { invoiceSchema } from '@/lib/validations/invoice';

const prisma = new PrismaClient();

// GET Single Invoice - GET /api/invoices/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const { userId } = await getAuthUser(request);

    // Get invoice
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId, // Ensure invoice belongs to user
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        sale: {
          select: {
            id: true,
            receiptNumber: true,
            amountPaid: true,
            balance: true,
            status: true,
            payments: true,
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

    return NextResponse.json(
      {
        success: true,
        invoice,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get invoice error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { message: error.message },
        { status: 401 }
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

// UPDATE Invoice - PATCH /api/invoices/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const { userId } = await getAuthUser(request);

    // Check if invoice exists and belongs to user
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Don't allow updating invoices that have been converted to sales
    if (existingInvoice.saleId) {
      return NextResponse.json(
        { message: 'Cannot update invoice that has been converted to sale' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    
    // Partial validation schema
    const updateSchema = invoiceSchema.partial();
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

    // If customer is being updated, verify it exists
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

    // Update invoice
    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        ...(data.customer && {
          customerId: data.customer.id || null,
          customerName: data.customer.id ? null : data.customer.name,
          customerEmail: data.customer.id ? null : data.customer.email,
          customerPhone: data.customer.id ? null : data.customer.phone,
        }),
        ...(data.invoiceTitle !== undefined && { title: data.invoiceTitle }),
        ...(data.invoiceDescription !== undefined && { description: data.invoiceDescription }),
        ...(data.includeVAT !== undefined && { includeVAT: data.includeVAT }),
        ...(data.items && { items: data.items }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.vatAmount !== undefined && { vatAmount: data.vatAmount }),
        ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
      },
      include: {
        customer: true,
      },
    });

    return NextResponse.json(
      {
        message: 'Invoice updated successfully',
        success: true,
        invoice,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update invoice error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { message: error.message },
        { status: 401 }
      );
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

// DELETE Invoice - DELETE /api/invoices/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const { userId } = await getAuthUser(request);

    // Check if invoice exists and belongs to user
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Don't allow deleting invoices that have been converted to sales
    if (invoice.saleId) {
      return NextResponse.json(
        { message: 'Cannot delete invoice that has been converted to sale' },
        { status: 400 }
      );
    }

    // Delete invoice
    await prisma.invoice.delete({
      where: { id: params.id },
    });

    return NextResponse.json(
      {
        message: 'Invoice deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete invoice error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { message: error.message },
        { status: 401 }
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