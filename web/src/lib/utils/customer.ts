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

  if (!customerData) {
    return {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      customerRole,
    };
  }

  // Handle existing customer by ID
  if (customerData.id) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerData.id,
        userId: userId,
      },
    });

    if (!customer) {
      throw new Error('Customer not found or does not belong to you');
    }

    customerId = customer.id;
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
      const customer = await prisma.customer.create({
        data: {
          userId,
          name: customerData.name,
          email: customerData.email || null,
          phone: customerData.phone || null,
          customerRole: role,
        },
      });
      customerId = customer.id;
    } else if (existingCustomer) {
      // Use existing customer
      customerId = existingCustomer.id;
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
  };
}
