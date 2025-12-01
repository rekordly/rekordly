import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';

import { PaymentMethod } from '@/types/index';
import { addExpenseSchema } from '@/lib/validations/expenses';
import { ExpenseCategory } from '@/types/expenses';
import { validateWorkTypeForCategory } from '@/lib/utils/workTypeValidation';

export async function POST(request: NextRequest) {
  try {
    const { userId, workTypes } = await getAuthUser(request);

    const expensesData = await validateRequest(request, addExpenseSchema);

    validateWorkTypeForCategory(
      workTypes,
      expensesData.category as ExpenseCategory,
      false
    );

    const result = await prisma.$transaction(
      async tx => {
        const expense = await tx.expense.create({
          data: {
            userId,
            category: expensesData.category as ExpenseCategory,
            subCategory: expensesData.subCategory,
            amount: toTwoDecimals(expensesData.amount),
            description: expensesData.description
              ? expensesData.description
              : '',
            date: expensesData.date ? new Date(expensesData.date) : new Date(),
            isDeductible: expensesData.isDeductible,
            deductionPercentage: expensesData.deductionPercentage,
            // note: expensesData.description ? expensesData.description : ` `,
            vendorName: expensesData.vendorName
              ? expensesData.vendorName
              : `N/A`,
            receipt: expensesData.receipt ? expensesData.receipt : ` `,
          },
        });

        const payment = await tx.payment.create({
          data: {
            userId,
            expensesId: expense.id,
            payableType: 'OTHER_EXPENSES',
            amount: toTwoDecimals(expensesData.amount),
            paymentDate: expensesData.date
              ? new Date(expensesData.date)
              : new Date(),
            paymentMethod: (expensesData.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'EXPENSE',
            reference: expensesData.reference || null,
            notes: expensesData.description
              ? expensesData.description
              : `Payment for ${expensesData.subCategory} `,
          },
        });

        return { expense, payment };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Expenses recorded successfully',
        success: true,
        payment: result.payment,
        income: result.expense,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Record purchase payment error:', error);

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
