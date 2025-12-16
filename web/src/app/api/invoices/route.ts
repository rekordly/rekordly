import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { invoiceSchema } from '@/lib/validations/invoices';
import { generateInvoiceNumber, toTwoDecimals } from '@/lib/fn';
import { sendInvoiceEmail } from '@/lib/email/send-invoice';
import { resolveCustomer } from '@/lib/utils/customer';
import { validateRequest } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, invoiceSchema);

    const { customerId, customerName, customerEmail, customerPhone, customer } =
      await resolveCustomer(userId, data.customer, data.addAsNewCustomer);

    // Generate unique invoice number
    let invoiceNumber = generateInvoiceNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.invoice.findUnique({
        where: { invoiceNumber },
      });

      if (!existing) break;
      invoiceNumber = generateInvoiceNumber(userId);
      attempts++;
    }

    if (attempts >= 5) {
      return NextResponse.json(
        {
          message:
            'Failed to generate unique invoice number. Please try again.',
        },
        { status: 500 }
      );
    }

    const processedItems = data.items.map((item: any) => ({
      ...item,
      price: toTwoDecimals(item.price || item.rate),
      rate: toTwoDecimals(item.rate || item.price),
      amount: toTwoDecimals(item.amount),
    }));

    const amount = toTwoDecimals(data.amount);
    const vatAmount = toTwoDecimals(data.vatAmount);
    const totalAmount = toTwoDecimals(data.totalAmount);

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        userId,
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        title: data.invoiceTitle,
        description: data.invoiceDescription,
        includeVAT: data.includeVAT,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        items: processedItems,
        amount,
        vatAmount,
        totalAmount,
        status: data.status || 'DRAFT',
      },
      include: {
        // customer: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            onboarding: true,
          },
        },
      },
    });

    if (
      invoice.status === 'SENT' &&
      (invoice.customerEmail || customer?.email)
    ) {
      const recipientEmail = invoice.customerEmail || customer?.email;

      if (recipientEmail) {
        try {
          const businessInfo = {
            name:
              invoice.user.onboarding?.businessName ||
              invoice.user.name ||
              'Rekordly',
            email: invoice.user.email || '',
            phone: invoice.user.onboarding?.phoneNumber || '',
          };

          await sendInvoiceEmail(invoice, recipientEmail, businessInfo);
        } catch (emailError) {
          console.error('Failed to send invoice email:', emailError);
        }
      }
    }

    const { user, ...invoiceWithoutUser } = invoice;

    return NextResponse.json(
      {
        message:
          invoice.status === 'SENT'
            ? 'Invoice created and sent successfully'
            : 'Invoice saved as draft',
        success: true,
        invoice: invoiceWithoutUser,
        customer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create invoice error:', error);

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

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
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
              status: true,
              amountPaid: true,
              balance: true,
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        invoices,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get invoices error:', error);

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
