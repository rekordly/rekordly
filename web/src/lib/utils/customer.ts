import { prisma } from '@/lib/prisma';

interface CustomerData {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customerRole?: 'BUYER' | 'SUPPLIER';
}

interface CustomerResult {
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerRole: 'BUYER' | 'SUPPLIER';
  customer?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    customerRole: 'BUYER' | 'SUPPLIER';
    createdAt: Date;
    updatedAt: Date;
    _count: {
      sales: number;
      purchases: number;
      invoices: number;
    };
    totalSpent?: number;
    totalOwed?: number;
    totalRevenue?: number;
    totalDebt?: number;
  } | null;
}

export async function resolveCustomer(
  userId: string,
  customerData: CustomerData | undefined,
  addAsNewCustomer: boolean = false
): Promise<CustomerResult> {
  let customerId: string | null = null;
  let customerName: string | null = null;
  let customerEmail: string | null = null;
  let customerPhone: string | null = null;
  let customerRole: 'BUYER' | 'SUPPLIER' = 'BUYER';
  let customer: CustomerResult['customer'] = null;

  if (!customerData) {
    return {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      customerRole,
      customer,
    };
  }

  // Handle existing customer by ID
  if (customerData.id) {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: customerData.id,
        userId: userId,
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
        sales: {
          select: {
            totalAmount: true,
            amountPaid: true,
            balance: true,
            status: true,
          },
        },
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

    if (!existingCustomer) {
      throw new Error('Customer not found or does not belong to you');
    }

    customerId = existingCustomer.id;

    // Calculate financial stats
    if (existingCustomer.customerRole === 'BUYER') {
      const totalSpent = existingCustomer.sales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0
      );
      const totalOwed = existingCustomer.sales.reduce(
        (sum, sale) => sum + sale.balance,
        0
      );

      customer = {
        id: existingCustomer.id,
        name: existingCustomer.name,
        email: existingCustomer.email,
        phone: existingCustomer.phone,
        customerRole: existingCustomer.customerRole,
        createdAt: existingCustomer.createdAt,
        updatedAt: existingCustomer.updatedAt,
        _count: existingCustomer._count,
        totalSpent,
        totalOwed,
      };
    } else {
      const totalRevenue = existingCustomer.purchases.reduce(
        (sum, purchase) => sum + purchase.totalAmount,
        0
      );
      const totalDebt = existingCustomer.purchases.reduce(
        (sum, purchase) => sum + purchase.balance,
        0
      );

      customer = {
        id: existingCustomer.id,
        name: existingCustomer.name,
        email: existingCustomer.email,
        phone: existingCustomer.phone,
        customerRole: existingCustomer.customerRole,
        createdAt: existingCustomer.createdAt,
        updatedAt: existingCustomer.updatedAt,
        _count: existingCustomer._count,
        totalRevenue,
        totalDebt,
      };
    }
  }
  // Handle adding as new customer
  else if (addAsNewCustomer) {
    // Rule 1: Don't create if no name provided
    if (!customerData.name) {
      return {
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        customerRole,
        customer,
      };
    }

    const role = customerData.customerRole || 'BUYER';

    // Check for existing customer with same name and role
    const existingCustomers = await prisma.customer.findMany({
      where: {
        userId,
        name: customerData.name,
        customerRole: role,
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
        sales: {
          select: {
            totalAmount: true,
            amountPaid: true,
            balance: true,
            status: true,
          },
        },
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

    // Determine if we should create or use existing
    let shouldCreate = true;
    let existingCustomer = null;

    for (const existing of existingCustomers) {
      const newEmail = customerData.email || null;
      const newPhone = customerData.phone || null;
      const existingEmail = existing.email || null;
      const existingPhone = existing.phone || null;

      // Check if this is a duplicate (same name, same role, and matching contact info)
      const bothHaveNoContact =
        !newEmail && !newPhone && !existingEmail && !existingPhone;
      const sameEmail = newEmail && existingEmail && newEmail === existingEmail;
      const samePhone = newPhone && existingPhone && newPhone === existingPhone;

      if (bothHaveNoContact || sameEmail || samePhone) {
        shouldCreate = false;
        existingCustomer = existing;
        break;
      }
    }

    if (shouldCreate) {
      // Create new customer
      const newCustomer = await prisma.customer.create({
        data: {
          userId,
          name: customerData.name,
          email: customerData.email || null,
          phone: customerData.phone || null,
          customerRole: role,
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
        },
      });

      customerId = newCustomer.id;

      // New customer has no transactions yet
      customer = {
        ...newCustomer,
        ...(role === 'BUYER'
          ? { totalSpent: 0, totalOwed: 0 }
          : { totalRevenue: 0, totalDebt: 0 }),
      };
    } else if (existingCustomer) {
      // Use existing customer
      customerId = existingCustomer.id;

      // Calculate financial stats for existing customer
      if (existingCustomer.customerRole === 'BUYER') {
        const totalSpent = existingCustomer.sales.reduce(
          (sum, sale) => sum + sale.totalAmount,
          0
        );
        const totalOwed = existingCustomer.sales.reduce(
          (sum, sale) => sum + sale.balance,
          0
        );

        customer = {
          id: existingCustomer.id,
          name: existingCustomer.name,
          email: existingCustomer.email,
          phone: existingCustomer.phone,
          customerRole: existingCustomer.customerRole,
          createdAt: existingCustomer.createdAt,
          updatedAt: existingCustomer.updatedAt,
          _count: existingCustomer._count,
          totalSpent,
          totalOwed,
        };
      } else {
        const totalRevenue = existingCustomer.purchases.reduce(
          (sum, purchase) => sum + purchase.totalAmount,
          0
        );
        const totalDebt = existingCustomer.purchases.reduce(
          (sum, purchase) => sum + purchase.balance,
          0
        );

        customer = {
          id: existingCustomer.id,
          name: existingCustomer.name,
          email: existingCustomer.email,
          phone: existingCustomer.phone,
          customerRole: existingCustomer.customerRole,
          createdAt: existingCustomer.createdAt,
          updatedAt: existingCustomer.updatedAt,
          _count: existingCustomer._count,
          totalRevenue,
          totalDebt,
        };
      }
    }
  }
  // Handle loose customer data (not adding as new customer)
  else if (customerData.name || customerData.email || customerData.phone) {
    customerName = customerData.name || null;
    customerEmail = customerData.email || null;
    customerPhone = customerData.phone || null;
    customerRole = customerData.customerRole || 'BUYER';
  }

  return {
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    customerRole,
    customer,
  };
}
