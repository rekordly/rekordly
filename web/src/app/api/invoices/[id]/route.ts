import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { baseInvoiceSchema } from '@/lib/validations/invoices';
import { validateRequest } from '@/lib/utils/validation';
import { resolveCustomer } from '@/lib/utils/customer';

// GET Single Invoice
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Get invoice
    const invoice = await prisma.invoice.findFirst({
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
        sale: {
          select: {
            id: true,
            receiptNumber: true,
            amountPaid: true,
            balance: true,
            status: true,
            payments: {
              select: {
                id: true,
                purchaseId: true,
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

// UPDATE Invoice
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id, userId },
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

    const updateSchema = baseInvoiceSchema.partial();

    const data = await validateRequest(request, updateSchema);

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

    let customer = null;

    if (data.customer?.customerRole) {
      const resolvedCustomer = await resolveCustomer(
        userId,
        data.customer,
        data.addAsNewCustomer
      );
      customer = resolvedCustomer.customer;
    }

    // Update invoice
    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(data.customer && {
          customerId: data.customer.id || null,
          customerName: data.customer.id ? null : data.customer.name,
          customerEmail: data.customer.id ? null : data.customer.email,
          customerPhone: data.customer.id ? null : data.customer.phone,
        }),
        ...(data.invoiceTitle !== undefined && { title: data.invoiceTitle }),
        ...(data.invoiceDescription !== undefined && {
          description: data.invoiceDescription,
        }),
        ...(data.includeVAT !== undefined && { includeVAT: data.includeVAT }),
        ...(data.items && { items: data.items }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.vatAmount !== undefined && { vatAmount: data.vatAmount }),
        ...(data.totalAmount !== undefined && {
          totalAmount: data.totalAmount,
        }),
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
        customer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update invoice error:', error);

    if (error instanceof NextResponse) return error;

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

// DELETE Invoice - DELETE /api/invoices/[id]
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    console.log('Deleting invoice with id:', id);
    console.log('Authenticated userId:', userId);

    // Check if invoice exists and belongs to user
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId },
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
      where: { id },
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
