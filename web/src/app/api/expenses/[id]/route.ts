import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { addExpenseSchema } from '@/lib/validations/expenses';
import { ExpenseCategory } from '@/types/expenses';
import { PaymentMethod } from '@/types/index';

// PATCH - Update expense record
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingExpense = await prisma.expense.findFirst({
      where: { id, userId },
      include: {
        payments: true,
      },
    });

    if (!existingExpense) {
      return NextResponse.json(
        { message: 'Expense record not found' },
        { status: 404 }
      );
    }

    const expenseData = await validateRequest(request, addExpenseSchema);

    const result = await prisma.$transaction(
      async tx => {
        // Update expense record
        const updatedExpense = await tx.expense.update({
          where: { id },
          data: {
            category: expenseData.category as ExpenseCategory,
            subCategory: expenseData.subCategory,
            amount: toTwoDecimals(expenseData.amount),
            description: expenseData.description,
            date: expenseData.date ? new Date(expenseData.date) : new Date(),
            isDeductible: expenseData.isDeductible ?? true,
            deductionPercentage: expenseData.deductionPercentage ?? 100,
            // note: expenseData.note,
            vendorName: expenseData.vendorName,
            receipt: expenseData.receipt,
            reference: expenseData.reference,
          },
        });

        // Update the associated payment
        const payment = existingExpense.payments[0]; // Should only have one payment
        if (payment) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              amount: toTwoDecimals(expenseData.amount),
              paymentDate: expenseData.date
                ? new Date(expenseData.date)
                : new Date(),
              paymentMethod: (expenseData.paymentMethod ||
                'BANK_TRANSFER') as PaymentMethod,
              reference: expenseData.reference || null,
              notes: expenseData.description
                ? expenseData.description
                : `Payment for ${expenseData.category}`,
            },
          });
        }

        return { expense: updatedExpense };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Expense record updated successfully',
        success: true,
        expense: result.expense,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update expense error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof z.ZodError) {
      const flatErrors = error.flatten().fieldErrors;
      const message = Object.values(flatErrors).flat()[0] || 'Invalid input';
      return NextResponse.json(
        { error: 'Validation failed', message },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete expense record
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingExpense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!existingExpense) {
      return NextResponse.json(
        { message: 'Expense record not found' },
        { status: 404 }
      );
    }

    // Delete expense record (payments will be cascade deleted)
    await prisma.expense.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Expense record deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete expense error:', error);

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
