import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { validateRequest } from '@/lib/utils/validation';
import { customerSchema } from '@/lib/validations/general';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const customerData = await validateRequest(request, customerSchema);

    const result = await resolveCustomer(userId, customerData, true);

    if (!result.customer) {
      return NextResponse.json(
        { message: 'Failed to create customer. Name is required.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: 'New Customer created successfully',
        success: true,
        customer: result.customer,
      },
      { status: 201 }
    );
  } catch (error) {
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

// GET All Customers - GET /api/customers
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const customerRole = searchParams.get('customerRole');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (customerRole && customerRole !== 'ALL') {
      where.customerRole = customerRole;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get all customers with their transaction details
    const [allCustomers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          customerRole: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              invoices: true,
              sales: true,
              purchases: true,
            },
          },
          // Get sales for buyers
          sales: {
            select: {
              totalAmount: true,
              amountPaid: true,
              balance: true,
              status: true,
            },
          },
          // Get purchases for suppliers
          purchases: {
            select: {
              totalAmount: true,
              amountPaid: true,
              balance: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    // Calculate financial stats for each customer
    const customersWithStats = allCustomers.map(customer => {
      if (customer.customerRole === 'BUYER') {
        // For buyers: calculate total spent and total owed
        const totalSpent = customer.sales.reduce(
          (sum, sale) => sum + sale.totalAmount,
          0
        );
        const totalOwed = customer.sales.reduce(
          (sum, sale) => sum + sale.balance,
          0
        );

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          customerRole: customer.customerRole,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          _count: customer._count,
          totalSpent,
          totalOwed,
        };
      } else {
        // For suppliers: calculate total revenue and total debt we owe them
        const totalRevenue = customer.purchases.reduce(
          (sum, purchase) => sum + purchase.totalAmount,
          0
        );
        const totalDebt = customer.purchases.reduce(
          (sum, purchase) => sum + purchase.balance,
          0
        );

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          customerRole: customer.customerRole,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          _count: customer._count,
          totalRevenue,
          totalDebt,
        };
      }
    });

    // Group customers by role
    const customersByRole = {
      BUYER: customersWithStats.filter(c => c.customerRole === 'BUYER'),
      SUPPLIER: customersWithStats.filter(c => c.customerRole === 'SUPPLIER'),
      ALL: customersWithStats,
    };

    // Calculate overall stats
    const buyers = customersWithStats.filter(c => c.customerRole === 'BUYER');
    const suppliers = customersWithStats.filter(
      c => c.customerRole === 'SUPPLIER'
    );

    const totalDebtors = buyers.filter(b => (b.totalOwed || 0) > 0).length;
    const totalCreditors = suppliers.filter(s => (s.totalDebt || 0) > 0).length;

    const totalDebtAmount = buyers.reduce(
      (sum, b) => sum + (b.totalOwed || 0),
      0
    );
    const totalCreditAmount = suppliers.reduce(
      (sum, s) => sum + (s.totalDebt || 0),
      0
    );

    const stats = {
      totalCustomers: total,
      totalBuyers: buyers.length,
      totalSuppliers: suppliers.length,
      totalDebtors,
      totalCreditors,
      totalDebtAmount,
      totalCreditAmount,
    };

    return NextResponse.json(
      {
        success: true,
        customers: customersWithStats,
        customersByRole,
        stats,
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
    console.error('Get customers error:', error);

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
