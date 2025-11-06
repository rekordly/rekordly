import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CustomerData {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface CustomerResult {
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
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

  if (!customerData) {
    return { customerId, customerName, customerEmail, customerPhone };
  }

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
  } else if (
    addAsNewCustomer &&
    (customerData.name || customerData.email || customerData.phone)
  ) {
    const whereClause: any = { userId };

    if (customerData.email) {
      whereClause.email = customerData.email;
    } else if (customerData.phone) {
      whereClause.phone = customerData.phone;
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
          name: customerData.name || 'Customer',
          email: customerData.email || null,
          phone: customerData.phone || null,
        },
      });
    }

    customerId = customer.id;
  } else if (customerData.name || customerData.email || customerData.phone) {
    customerName = customerData.name || null;
    customerEmail = customerData.email || null;
    customerPhone = customerData.phone || null;
  }

  return { customerId, customerName, customerEmail, customerPhone };
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
