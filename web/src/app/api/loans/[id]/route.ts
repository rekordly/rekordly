// app/api/loans/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { addLoanSchema } from '@/lib/validations/loan';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { baseInvoiceSchema } from '@/lib/validations/invoices';

// PATCH /api/loans/[id] - Update loan
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if loan exists and belongs to user
    const existingLoan = await prisma.loan.findFirst({
      where: { id, userId },
      include: {
        payments: true,
      },
    });

    if (!existingLoan) {
      return NextResponse.json(
        { message: 'Loan not found or unauthorized' },
        { status: 404 }
      );
    }

    const updateSchema = addLoanSchema.partial();
    const data = await validateRequest(request, updateSchema);

    // Calculate total charges
    const totalCharges = toTwoDecimals(
      (data.processingFee ?? (existingLoan.processingFee || 0)) +
        (data.managementFee ?? (existingLoan.managementFee || 0)) +
        (data.insuranceFee ?? (existingLoan.insuranceFee || 0)) +
        (data.otherCharges ?? (existingLoan.otherCharges || 0))
    );

    // Calculate total interest (simple interest)
    let totalInterest = 0;
    const term = data.term ?? existingLoan.term;
    const interestRate = data.interestRate ?? existingLoan.interestRate;
    const termUnit = data.termUnit ?? existingLoan.termUnit;
    const principalAmount =
      data.principalAmount ?? existingLoan.principalAmount;
    const startDate = data.startDate
      ? new Date(data.startDate)
      : existingLoan.startDate;

    if (term && interestRate && termUnit && principalAmount) {
      const annualRate = interestRate / 100;
      let termInYears = 0;

      if (termUnit === 'DAYS') {
        termInYears = term / 365;
      } else if (termUnit === 'MONTHS') {
        termInYears = term / 12;
      } else if (termUnit === 'YEARS') {
        termInYears = term;
      }

      totalInterest = toTwoDecimals(principalAmount * annualRate * termInYears);
    }

    // Calculate current balance (principal + charges + interest - payments made)
    const totalPayments = existingLoan.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    const currentBalance = toTwoDecimals(
      principalAmount + totalCharges + totalInterest - totalPayments
    );

    // Build update data object
    const updateData: any = {};

    // Party details
    if (data.partyName !== undefined) updateData.partyName = data.partyName;
    if (data.partyEmail !== undefined)
      updateData.partyEmail = data.partyEmail || null;
    if (data.partyPhone !== undefined)
      updateData.partyPhone = data.partyPhone || null;

    // Loan amount and rate
    if (data.principalAmount !== undefined)
      updateData.principalAmount = toTwoDecimals(data.principalAmount);
    if (data.interestRate !== undefined)
      updateData.interestRate = toTwoDecimals(data.interestRate);

    // Fees and charges
    if (data.processingFee !== undefined)
      updateData.processingFee = toTwoDecimals(data.processingFee);
    if (data.managementFee !== undefined)
      updateData.managementFee = toTwoDecimals(data.managementFee);
    if (data.insuranceFee !== undefined)
      updateData.insuranceFee = toTwoDecimals(data.insuranceFee);
    if (data.otherCharges !== undefined)
      updateData.otherCharges = toTwoDecimals(data.otherCharges);

    // Calculated fields
    updateData.totalCharges = totalCharges;
    updateData.currentBalance = currentBalance;

    // Date and term fields
    if (data.startDate !== undefined) {
      updateData.startDate = new Date(data.startDate);

      // If start date changes and term is set, recalculate end date
      if (term && termUnit) {
        const newEndDate = new Date(updateData.startDate);

        if (termUnit === 'DAYS') {
          newEndDate.setDate(newEndDate.getDate() + term);
        } else if (termUnit === 'MONTHS') {
          newEndDate.setMonth(newEndDate.getMonth() + term);
        } else if (termUnit === 'YEARS') {
          newEndDate.setFullYear(newEndDate.getFullYear() + term);
        }
        updateData.endDate = newEndDate;
      }
    }

    if (data.term !== undefined) {
      updateData.term = data.term || null;

      // If term changes, recalculate end date
      if (data.term && termUnit) {
        const endDate = new Date(startDate);

        if (termUnit === 'DAYS') {
          endDate.setDate(endDate.getDate() + data.term);
        } else if (termUnit === 'MONTHS') {
          endDate.setMonth(endDate.getMonth() + data.term);
        } else if (termUnit === 'YEARS') {
          endDate.setFullYear(endDate.getFullYear() + data.term);
        }
        updateData.endDate = endDate;
      } else if (data.term === null) {
        updateData.endDate = null;
      }
    }

    if (data.termUnit !== undefined) {
      updateData.termUnit = data.termUnit;

      // If term unit changes and term is set, recalculate end date
      if (term && data.termUnit) {
        const endDate = new Date(startDate);

        if (data.termUnit === 'DAYS') {
          endDate.setDate(endDate.getDate() + term);
        } else if (data.termUnit === 'MONTHS') {
          endDate.setMonth(endDate.getMonth() + term);
        } else if (data.termUnit === 'YEARS') {
          endDate.setFullYear(endDate.getFullYear() + term);
        }
        updateData.endDate = endDate;
      }
    }

    // Other fields
    if (data.paymentFrequency !== undefined)
      updateData.paymentFrequency = data.paymentFrequency;
    if (data.purpose !== undefined) updateData.purpose = data.purpose || null;
    if (data.collateral !== undefined)
      updateData.collateral = data.collateral || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.loanType !== undefined) updateData.loanType = data.loanType;

    // Update status if needed (e.g., if balance reaches 0)
    if (currentBalance <= 0 && existingLoan.status !== 'PAID_OFF') {
      updateData.status = 'PAID_OFF';
    } else if (currentBalance > 0 && existingLoan.status === 'PAID_OFF') {
      updateData.status = 'ACTIVE';
    }

    // Update the loan
    const loan = await prisma.loan.update({
      where: { id },
      data: updateData,
      include: {
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Loan updated successfully',
        success: true,
        loan,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update loan error:', error);

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

// DELETE /api/loans/[id] - Delete loan
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if loan exists and belongs to user
    const existingLoan = await prisma.loan.findFirst({
      where: { id, userId },
    });

    if (!existingLoan) {
      return NextResponse.json(
        { message: 'Loan not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete loan (payments and linked income/expense records will be cascade deleted)
    await prisma.loan.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Loan deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete loan error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/loans/[id] - Get single loan
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const loan = await prisma.loan.findFirst({
      where: { id, userId },
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

    if (!loan) {
      return NextResponse.json(
        { message: 'Loan not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        loan,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get loan error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
