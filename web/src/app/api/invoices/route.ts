import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth/server';
import { invoiceSchema } from '@/lib/validations/invoice';
import { generateInvoiceNumber, toTwoDecimals } from '@/lib/fn';
import { sendInvoiceEmail } from '@/lib/email/send-invoice';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = invoiceSchema.safeParse(body);

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

    let customerId: string | null = null;
    let customerName: string | null = null;
    let customerEmail: string | null = null;
    let customerPhone: string | null = null;

    // Handle customer logic
    if (data.customer?.id) {
      // Existing customer selected from autocomplete
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customer.id,
          userId: userId,
        },
      });

      if (!customer) {
        return NextResponse.json(
          { message: 'Customer not found or does not belong to you' },
          { status: 404 }
        );
      }

      customerId = customer.id;
    } else if (
      data.addAsNewCustomer &&
      (data.customer?.name || data.customer?.email || data.customer?.phone)
    ) {
      // User opted to add as new customer
      const whereClause: any = { userId };

      if (data.customer.email) {
        whereClause.email = data.customer.email;
      } else if (data.customer.phone) {
        whereClause.phone = data.customer.phone;
      }

      // Check if customer already exists
      let customer = await prisma.customer.findFirst({
        where: whereClause,
      });

      if (!customer) {
        // Create new customer
        customer = await prisma.customer.create({
          data: {
            userId,
            name: data.customer.name || 'Customer',
            email: data.customer.email || null,
            phone: data.customer.phone || null,
          },
        });
      }

      customerId = customer.id;
    } else if (
      data.customer?.name ||
      data.customer?.email ||
      data.customer?.phone
    ) {
      // Store as one-time customer info (not creating customer record)
      customerName = data.customer.name || null;
      customerEmail = data.customer.email || null;
      customerPhone = data.customer.phone || null;
    }

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
        customer: true,
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

    // Send email if status is SENT and customer has email
    if (
      invoice.status === 'SENT' &&
      (invoice.customerEmail || invoice.customer?.email)
    ) {
      const recipientEmail = invoice.customerEmail || invoice.customer?.email;

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
          // Don't fail the entire request if email fails
        }
      }
    }

    return NextResponse.json(
      {
        message:
          invoice.status === 'SENT'
            ? 'Invoice created and sent successfully'
            : 'Invoice saved as draft',
        success: true,
        // invoice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create invoice error:', error);

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

// GET All Invoices - GET /api/invoices
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
              payments: true,
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
