import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

import { getAuthUser } from '@/lib/utils/server';

const prisma = new PrismaClient();

// GET All Customers - GET /api/customers
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const customerRole = searchParams.get('customerRole'); // BUYER or SUPPLIER
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (customerRole) {
      where.customerRole = customerRole;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get all customers and group them by role
    const [allCustomers, total] = await Promise.all([
      prisma.customer.findMany({
        where: { userId },
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count({ where: { userId } }),
    ]);

    // Group customers by role
    const customersByRole = {
      BUYER: allCustomers.filter(c => c.customerRole === 'BUYER'),
      SUPPLIER: allCustomers.filter(c => c.customerRole === 'SUPPLIER'),
      ALL: allCustomers, // For backward compatibility
    };

    // If customerRole filter is specified, return filtered list
    if (customerRole) {
      const filteredCustomers = allCustomers.filter(
        c => c.customerRole === customerRole
      );

      return NextResponse.json(
        {
          success: true,
          customers: filteredCustomers,
          customersByRole,
          pagination: {
            page,
            limit,
            total: filteredCustomers.length,
            totalPages: Math.ceil(filteredCustomers.length / limit),
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        customers: allCustomers,
        customersByRole,
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
