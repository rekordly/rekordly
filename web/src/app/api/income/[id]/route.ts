// app/api/income/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { addIncomeSchema } from '@/lib/validations/income';
import {
  formatCustomSubCategory,
  IncomeMainCategory,
  IncomeRecordStatus,
  IncomeSubCategory,
  normalizeIncomeSubCategory,
} from '@/types/income';
import { PaymentMethod } from '@/types/index';
import { validateWorkTypeForCategory } from '@/lib/utils/workTypeValidation';

// PATCH - Update income record
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId, workTypes } = await getAuthUser(request);

    const existingIncome = await prisma.incomeRecord.findFirst({
      where: { id, userId },
      include: {
        payments: true,
      },
    });

    if (!existingIncome) {
      return NextResponse.json(
        { message: 'Income record not found' },
        { status: 404 }
      );
    }

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

    const grossAmount = toTwoDecimals(incomeData.grossAmount);

    const result = await prisma.$transaction(
      async tx => {
        // Update income record
        const updatedIncome = await tx.incomeRecord.update({
          where: { id },
          data: {
            mainCategory: incomeData.mainCategory as IncomeMainCategory,
            subCategory: subCategory as IncomeSubCategory,
            customSubCategory: customSubCategory,
            grossAmount: grossAmount,
            amountPaid: grossAmount, // Update paid amount to match new amount
            balance: 0, // Recalculate balance
            status: IncomeRecordStatus.PAID, // Maintain paid status
            taxablePercentage: incomeData.taxablePercentage,
            description: incomeData.description,
            date: incomeData.date ? new Date(incomeData.date) : new Date(),
          },
        });

        // Update the associated payment
        const payment = existingIncome.payments[0];
        if (payment) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              amount: grossAmount,
              paymentDate: incomeData.date
                ? new Date(incomeData.date)
                : new Date(),
              paymentMethod: (incomeData.paymentMethod ||
                'BANK_TRANSFER') as PaymentMethod,
              reference: incomeData.reference || null,
              notes:
                incomeData.description ||
                `Payment for ${incomeData.subCategory}`,
            },
          });
        }

        return { income: updatedIncome };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Income record updated successfully',
        success: true,
        income: result.income,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update income error:', error);

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

// DELETE - Delete income record
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingIncome = await prisma.incomeRecord.findFirst({
      where: { id, userId },
    });

    if (!existingIncome) {
      return NextResponse.json(
        { message: 'Income record not found' },
        { status: 404 }
      );
    }

    // Delete income record (payments will be cascade deleted)
    await prisma.incomeRecord.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Income record deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete income error:', error);

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
