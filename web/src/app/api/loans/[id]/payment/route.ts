import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
// import { recordLoanPaymentSchema } from '@/lib/validations/loan';
import { toTwoDecimals } from '@/lib/fn';
import { addPaymentSchema } from '@/lib/validations/general';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const loanId = id;

    // Check if loan exists and belongs to user
    const existingLoan = await prisma.loan.findFirst({
      where: { id: loanId, userId },
    });

    if (!existingLoan) {
      return NextResponse.json(
        { message: 'Loan not found or unauthorized' },
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

    // Check if loan is already paid off
    if (existingLoan.status === 'PAID_OFF') {
      return NextResponse.json(
        { message: 'Loan is already paid off' },
        { status: 400 }
      );
    }

    // Check if loan is written off or defaulted
    if (
      existingLoan.status === 'WRITTEN_OFF' ||
      existingLoan.status === 'DEFAULTED'
    ) {
      return NextResponse.json(
        {
          message: `Cannot add payment to a ${existingLoan.status.toLowerCase().replace('_', ' ')} loan`,
        },
        { status: 400 }
      );
    }

    const paymentAmount = toTwoDecimals(data.amountPaid);
    const existingBalance = existingLoan.currentBalance;

    // SIMPLIFIED LOGIC: Auto-calculate principal vs interest
    let principalAmount = 0;
    let interestAmount = 0;

    if (existingBalance > 0) {
      // Still have principal to pay
      if (paymentAmount <= existingBalance) {
        // Payment goes entirely to principal
        principalAmount = paymentAmount;
        interestAmount = 0;
      } else {
        // Payment covers remaining principal + interest
        principalAmount = existingBalance;
        interestAmount = paymentAmount - existingBalance;
      }
    } else {
      // Principal fully paid, all payment is interest
      principalAmount = 0;
      interestAmount = paymentAmount;
    }

    // Use transaction to create payment, update loan, and create income/expense records
    const result = await prisma.$transaction(async tx => {
      // 1. Create payment record
      const payment = await tx.payment.create({
        data: {
          userId,
          payableType: 'LOAN',
          loanId: existingLoan.id,
          amount: paymentAmount,
          paymentDate: data.paymentDate
            ? new Date(data.paymentDate)
            : new Date(),
          paymentMethod: data.paymentMethod,
          category:
            existingLoan.loanType === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE',
          reference: data.reference || null,
          notes: data.notes || null,
        },
      });

      // 2. Update loan balances
      const newTotalPaid = toTwoDecimals(
        existingLoan.totalPaid + principalAmount
      );
      const newTotalInterestPaid = toTwoDecimals(
        existingLoan.totalInterestPaid + interestAmount
      );
      const newCurrentBalance = toTwoDecimals(
        existingLoan.currentBalance - principalAmount
      );

      // Determine new status
      let newStatus = existingLoan.status;
      if (newCurrentBalance <= 0) {
        newStatus = 'PAID_OFF';
      }

      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          totalPaid: newTotalPaid,
          totalInterestPaid: newTotalInterestPaid,
          currentBalance: Math.max(0, newCurrentBalance), // Ensure balance doesn't go negative
          status: newStatus,
        },
        include: {
          payments: {
            select: {
              id: true,
              loanId: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
              category: true,
              payableType: true,
              reference: true,
              notes: true,
            },
            orderBy: {
              paymentDate: 'desc',
            },
          },
        },
      });

      // 3. Create or UPDATE single interest income/expense record
      let interestRecord = null;
      if (interestAmount > 0) {
        if (existingLoan.loanType === 'RECEIVABLE') {
          // Interest income from loan you gave
          // Check if interest record already exists for this loan
          const existingInterestRecord = await tx.incomeRecord.findFirst({
            where: {
              userId,
              linkedLoanId: existingLoan.id,
              subCategory: 'INTEREST_INCOME',
            },
          });

          if (existingInterestRecord) {
            // UPDATE existing interest record
            interestRecord = await tx.incomeRecord.update({
              where: { id: existingInterestRecord.id },
              data: {
                grossAmount: toTwoDecimals(
                  existingInterestRecord.grossAmount + interestAmount
                ),
              },
            });
          } else {
            // CREATE new interest record
            interestRecord = await tx.incomeRecord.create({
              data: {
                userId,
                mainCategory: 'INVESTMENT_INCOME',
                subCategory: 'INTEREST_INCOME',
                grossAmount: interestAmount,
                taxablePercentage: 100,
                description: `Interest earned on loan to ${existingLoan.partyName || 'borrower'} - ${existingLoan.loanNumber}`,
                date: data.paymentDate
                  ? new Date(data.paymentDate)
                  : new Date(),
                linkedLoanId: existingLoan.id,
              },
            });
          }

          // Create payment link for THIS interest payment
          await tx.payment.create({
            data: {
              userId,
              payableType: 'OTHER_INCOME',
              incomeId: interestRecord.id,
              amount: interestAmount,
              paymentDate: data.paymentDate
                ? new Date(data.paymentDate)
                : new Date(),
              paymentMethod: data.paymentMethod,
              category: 'INCOME',
              reference: data.reference || null,
              notes: `Interest payment for loan ${existingLoan.loanNumber}`,
            },
          });
        } else {
          // Interest expense on loan you received
          // Check if interest record already exists for this loan
          const existingInterestRecord = await tx.expense.findFirst({
            where: {
              userId,
              linkedLoanId: existingLoan.id,
              category: 'INTEREST_ON_DEBT',
            },
          });

          if (existingInterestRecord) {
            // UPDATE existing interest record
            interestRecord = await tx.expense.update({
              where: { id: existingInterestRecord.id },
              data: {
                amount: toTwoDecimals(
                  existingInterestRecord.amount + interestAmount
                ),
              },
            });
          } else {
            // CREATE new interest record
            interestRecord = await tx.expense.create({
              data: {
                userId,
                category: 'INTEREST_ON_DEBT',
                amount: interestAmount,
                description: `Interest paid on loan from ${existingLoan.partyName || 'lender'} - ${existingLoan.loanNumber}`,
                date: data.paymentDate
                  ? new Date(data.paymentDate)
                  : new Date(),
                isDeductible: true,
                deductionPercentage: 100,
                linkedLoanId: existingLoan.id,
              },
            });
          }

          // Create payment link for THIS interest payment
          await tx.payment.create({
            data: {
              userId,
              payableType: 'OTHER_EXPENSES',
              expensesId: interestRecord.id,
              amount: interestAmount,
              paymentDate: data.paymentDate
                ? new Date(data.paymentDate)
                : new Date(),
              paymentMethod: data.paymentMethod,
              category: 'EXPENSE',
              reference: data.reference || null,
              notes: `Interest payment for loan ${existingLoan.loanNumber}`,
            },
          });
        }
      }

      return { loan: updatedLoan, payment, interestRecord };
    });

    return NextResponse.json(
      {
        message: 'Loan payment recorded successfully',
        success: true,
        loan: result.loan,
        payment: result.payment,
        interestRecord: result.interestRecord,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Add loan payment error:', error);

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
