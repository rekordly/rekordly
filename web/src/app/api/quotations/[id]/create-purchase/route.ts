import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';

// GET /api/quotations/[id]/create-purchase - Pre-fill purchase form from quotation
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Fetch quotation with line items
    const quotation = await prisma.quotation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            customerRole: true,
          },
        },
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { message: 'Quotation not found' },
        { status: 404 }
      );
    }

    // Parse lineItems from JSON
    const lineItems = (quotation.lineItems as any[]) || [];

    // Filter line items where type === 'MATERIAL'
    // Map to purchase item format
    const materialItems = lineItems
      .filter((item: any) => item.type === 'MATERIAL')
      .map((item: any) => ({
        itemName: item.name,
        description: item.description || item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        // Optional: link to inventory if inventoryItemId exists
        inventoryItemId: item.inventoryItemId || null,
      }));

    // Build purchase pre-fill data
    const purchasePreFill = {
      sourceQuotationId: quotation.id,
      customer: quotation.customerId
        ? {
            id: quotation.customerId,
            name: quotation.customer?.name || quotation.customerName,
            email: quotation.customerEmail || quotation.customer?.email || null,
            phone: quotation.customerPhone || quotation.customer?.phone || null,
            customerRole: quotation.customer?.customerRole || 'SUPPLIER',
          }
        : {
            name: quotation.customerName,
            email: quotation.customerEmail || null,
            phone: quotation.customerPhone || null,
            customerRole: 'SUPPLIER',
          },
      title: quotation.title,
      description: quotation.description,
      items: materialItems,
      subtotal: quotation.subtotal,
      includeVAT: quotation.includeVAT,
      vatAmount: quotation.vatAmount,
      totalAmount: quotation.totalAmount,
      amountPaid: quotation.amountPaid,
      balance: quotation.balance,
    };

    return NextResponse.json(
      {
        success: true,
        quotation: {
          id: quotation.id,
          quotationNumber: quotation.quotationNumber,
        },
        purchasePreFill,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get quotation for purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
