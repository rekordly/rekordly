import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { addPaymentSchema } from '@/lib/validations/general';
import { formatCurrency, toTwoDecimals } from '@/lib/fn';

// Helper for formatting currency in error messages

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthUser(request);
    const { id: paymentId } = await params;

    // Check if payment exists and belongs to user
    const existingPayment = await prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });

    if (!existingPayment) {
      return NextResponse.json(
        { message: 'Payment not found or unauthorized' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = addPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const newAmount = toTwoDecimals(data.amountPaid);
    const oldAmount = existingPayment.amount;
    const amountDifference = newAmount - oldAmount;

    // Get the related entity (sale, quotation, or purchase)
    let relatedEntity: any = null;
    let entityType: 'sale' | 'quotation' | 'purchase' | null = null;
    let entityIdField: string | null = null;

    if (existingPayment.saleId) {
      relatedEntity = await prisma.sale.findUnique({
        where: { id: existingPayment.saleId },
        include: {
          payments: true,
        },
      });
      entityType = 'sale';
      entityIdField = 'saleId';
    } else if (existingPayment.quotationId) {
      relatedEntity = await prisma.quotation.findUnique({
        where: { id: existingPayment.quotationId },
        include: {
          payments: true,
        },
      });
      entityType = 'quotation';
      entityIdField = 'quotationId';
    } else if (existingPayment.purchaseId) {
      relatedEntity = await prisma.purchase.findUnique({
        where: { id: existingPayment.purchaseId },
        include: {
          payments: true,
        },
      });
      entityType = 'purchase';
      entityIdField = 'purchaseId';
    }

    if (!relatedEntity || !entityType) {
      return NextResponse.json(
        { message: 'Related entity not found' },
        { status: 404 }
      );
    }

    if (
      relatedEntity.status === 'REFUNDED' ||
      relatedEntity.status === 'PARTIALLY_REFUNDED'
    ) {
      return NextResponse.json(
        { message: `Cannot update payment for a refunded ${entityType}` },
        { status: 400 }
      );
    }

    // Calculate other payments total (excluding this payment)
    const otherPaymentsTotal = relatedEntity.payments
      .filter((p: any) => p.id !== paymentId)
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    // Check if new amount would exceed total
    const newTotalPaid = toTwoDecimals(otherPaymentsTotal + newAmount);

    if (newTotalPaid > relatedEntity.totalAmount) {
      const maxAllowed = toTwoDecimals(
        relatedEntity.totalAmount - otherPaymentsTotal
      );
      return NextResponse.json(
        {
          message: `Payment amount cannot exceed remaining balance. Maximum for this payment: ${formatCurrency(maxAllowed)}`,
        },
        { status: 400 }
      );
    }

    // Use transaction to update payment and related entity
    const result = await prisma.$transaction(
      async tx => {
        // Update payment
        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            amount: newAmount,
            paymentMethod: data.paymentMethod,
            paymentDate: new Date(data.paymentDate),
            reference: data.reference || null,
            notes: data.notes || null,
          },
        });

        // Update related entity
        const newBalance = toTwoDecimals(
          relatedEntity.totalAmount - newTotalPaid
        );

        // Determine new status
        let newStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'REFUNDED' =
          relatedEntity.status;

        // Only update status if not refunded
        if (
          relatedEntity.status !== 'REFUNDED' &&
          relatedEntity.status !== 'PARTIALLY_REFUNDED'
        ) {
          if (newTotalPaid >= relatedEntity.totalAmount) {
            newStatus = 'PAID';
          } else if (newTotalPaid > 0) {
            newStatus = 'PARTIALLY_PAID';
          } else {
            newStatus = 'UNPAID';
          }
        }

        let updatedEntity;
        if (entityType === 'sale') {
          updatedEntity = await tx.sale.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              customer: true,
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        } else if (entityType === 'quotation') {
          updatedEntity = await tx.quotation.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              customer: true,
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        } else if (entityType === 'purchase') {
          updatedEntity = await tx.purchase.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        }

        return { payment: updatedPayment, entity: updatedEntity, entityType };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Payment updated successfully',
        success: true,
        payment: result.payment,
        [result.entityType!]: result.entity,
        entity: result.entity,
        entityType: result.entityType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update payment error:', error);

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
  }
}

// app/api/payments/[id]/route.ts - DELETE endpoint

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthUser(request);
    const { id: paymentId } = await params;

    // Check if payment exists and belongs to user
    const existingPayment = await prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });

    if (!existingPayment) {
      return NextResponse.json(
        { message: 'Payment not found or unauthorized' },
        { status: 404 }
      );
    }

    const paymentAmount = existingPayment.amount;

    // Get the related entity (sale, quotation, or purchase)
    let relatedEntity: any = null;
    let entityType: 'sale' | 'quotation' | 'purchase' | null = null;

    if (existingPayment.saleId) {
      relatedEntity = await prisma.sale.findUnique({
        where: { id: existingPayment.saleId },
        include: {
          payments: true,
        },
      });
      entityType = 'sale';
    } else if (existingPayment.quotationId) {
      relatedEntity = await prisma.quotation.findUnique({
        where: { id: existingPayment.quotationId },
        include: {
          payments: true,
        },
      });
      entityType = 'quotation';
    } else if (existingPayment.purchaseId) {
      relatedEntity = await prisma.purchase.findUnique({
        where: { id: existingPayment.purchaseId },
        include: {
          payments: true,
        },
      });
      entityType = 'purchase';
    }

    if (!relatedEntity || !entityType) {
      return NextResponse.json(
        { message: 'Related entity not found' },
        { status: 404 }
      );
    }

    if (
      relatedEntity.status === 'REFUNDED' ||
      relatedEntity.status === 'PARTIALLY_REFUNDED'
    ) {
      return NextResponse.json(
        { message: `Cannot delete payment for a refunded ${entityType}` },
        { status: 400 }
      );
    }

    // Calculate new totals after removing this payment
    const otherPaymentsTotal = relatedEntity.payments
      .filter((p: any) => p.id !== paymentId)
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    const newTotalPaid = toTwoDecimals(otherPaymentsTotal);
    const newBalance = toTwoDecimals(relatedEntity.totalAmount - newTotalPaid);

    // Determine new status
    let newStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'REFUNDED' =
      relatedEntity.status;

    // Only update status if not refunded
    if (
      relatedEntity.status !== 'REFUNDED' &&
      relatedEntity.status !== 'PARTIALLY_REFUNDED'
    ) {
      if (newTotalPaid >= relatedEntity.totalAmount) {
        newStatus = 'PAID';
      } else if (newTotalPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      } else {
        newStatus = 'UNPAID';
      }
    }

    // Use transaction to delete payment and update related entity
    const result = await prisma.$transaction(
      async tx => {
        // Delete payment
        const deletedPayment = await tx.payment.delete({
          where: { id: paymentId },
        });

        // Update related entity
        let updatedEntity;
        if (entityType === 'sale') {
          updatedEntity = await tx.sale.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              customer: true,
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        } else if (entityType === 'quotation') {
          updatedEntity = await tx.quotation.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              customer: true,
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        } else if (entityType === 'purchase') {
          updatedEntity = await tx.purchase.update({
            where: { id: relatedEntity.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
            include: {
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
          });
        }

        return { payment: deletedPayment, entity: updatedEntity, entityType };
      },
      {
        maxWait: 10000, // Maximum time to wait to start transaction (10 seconds)
        timeout: 15000, // Maximum time transaction can run (15 seconds)
      }
    );

    return NextResponse.json(
      {
        message: 'Payment deleted successfully',
        success: true,
        payment: result.payment,
        entity: result.entity,
        entityType: result.entityType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete payment error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
