import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { addIncomeSchema } from '@/lib/validations/income';
import {
  formatCustomSubCategory,
  IncomeMainCategory,
  IncomeSubCategory,
  normalizeIncomeSubCategory,
} from '@/types/income';
import { PaymentMethod } from '@/types/index';
import { validateWorkTypeForCategory } from '@/lib/utils/workTypeValidation';

export async function POST(request: NextRequest) {
  try {
    const { userId, workTypes } = await getAuthUser(request);

    const incomeData = await validateRequest(request, addIncomeSchema);
    const normalizedSubCategory = normalizeIncomeSubCategory(
      incomeData.subCategory
    );

    const subCategory = normalizedSubCategory
      ? normalizedSubCategory
      : IncomeSubCategory.CUSTOM;

    const customSubCategory = normalizedSubCategory
      ? null
      : formatCustomSubCategory(incomeData.subCategory);

    validateWorkTypeForCategory(
      workTypes,
      incomeData.mainCategory as IncomeMainCategory,
      true
    );

    const result = await prisma.$transaction(
      async tx => {
        const income = await tx.incomeRecord.create({
          data: {
            userId,
            mainCategory: incomeData.mainCategory as IncomeMainCategory,
            subCategory: subCategory as IncomeSubCategory,
            customSubCategory: customSubCategory,
            grossAmount: toTwoDecimals(incomeData.grossAmount),
            taxablePercentage: incomeData.taxablePercentage,
            description: incomeData.description,
            date: incomeData.date ? new Date(incomeData.date) : new Date(),
          },
        });

        const payment = await tx.payment.create({
          data: {
            userId,
            incomeId: income.id,
            payableType: 'OTHER_INCOME',
            amount: toTwoDecimals(incomeData.grossAmount),
            paymentDate: incomeData.date
              ? new Date(incomeData.date)
              : new Date(),
            paymentMethod: (incomeData.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'INCOME',
            reference: incomeData.reference || null,
            notes: incomeData.description
              ? incomeData.description
              : `Payment for ${incomeData.subCategory} `,
          },
        });

        return { income, payment };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Income recorded successfully',
        success: true,
        payment: result.payment,
        income: result.income,
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
