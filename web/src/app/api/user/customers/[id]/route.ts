import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { customerSchema } from '@/lib/validations/general';

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id: customerId } = await params;
    const { userId } = await getAuthUser(request);

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId: userId,
      },
    });

    if (!customer) {
      throw new Error('Customer not found or does not belong to you');
    }

    const customerData = await validateRequest(request, customerSchema);

    // Update customer
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(customerData.name !== undefined && { name: customerData.name }),
        ...(customerData.email !== undefined && {
          email: customerData.email || null,
        }),
        ...(customerData.phone !== undefined && {
          phone: customerData.phone || null,
        }),
        ...(customerData.customerRole !== undefined && {
          customerRole: customerData.customerRole,
        }),
      },
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
    });

    // Calculate financial stats
    let customerWithStats;

    if (updatedCustomer.customerRole === 'BUYER') {
      const totalSpent = updatedCustomer.sales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0
      );
      const totalOwed = updatedCustomer.sales.reduce(
        (sum, sale) => sum + sale.balance,
        0
      );

      customerWithStats = {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
        customerRole: updatedCustomer.customerRole,
        createdAt: updatedCustomer.createdAt,
        updatedAt: updatedCustomer.updatedAt,
        _count: updatedCustomer._count,
        totalSpent,
        totalOwed,
      };
    } else {
      const totalRevenue = updatedCustomer.purchases.reduce(
        (sum, purchase) => sum + purchase.totalAmount,
        0
      );
      const totalDebt = updatedCustomer.purchases.reduce(
        (sum, purchase) => sum + purchase.balance,
        0
      );

      customerWithStats = {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
        customerRole: updatedCustomer.customerRole,
        createdAt: updatedCustomer.createdAt,
        updatedAt: updatedCustomer.updatedAt,
        _count: updatedCustomer._count,
        totalRevenue,
        totalDebt,
      };
    }

    return NextResponse.json(
      {
        message: 'Customer updated successfully',
        success: true,
        customer: customerWithStats,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update Customer error:', error);

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

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id: customerId } = await params;
    const { userId } = await getAuthUser(request);

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId: userId,
      },
    });

    if (!customer) {
      throw new Error('Customer not found or does not belong to you');
    }

    await prisma.customer.delete({
      where: { id: customerId },
    });

    return NextResponse.json(
      {
        message: 'Customer deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete customer error:', error);

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
