import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { addLoanSchema } from '@/lib/validations/loan';
import { generateLoanNumber, toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, addLoanSchema);

    // Generate unique loan number
    let loanNumber = generateLoanNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.loan.findUnique({
        where: { loanNumber },
      });

      if (!existing) break;
      loanNumber = generateLoanNumber(userId);
      attempts++;
    }

    if (attempts >= 5) {
      return NextResponse.json(
        {
          message: 'Failed to generate unique loan number. Please try again.',
        },
        { status: 500 }
      );
    }

    const startDate = data.startDate ? new Date(data.startDate) : new Date();

    // Calculate end date from term and termUnit if provided
    let endDate = null;
    if (data.term && startDate && data.termUnit) {
      endDate = new Date(startDate);

      if (data.termUnit === 'DAYS') {
        endDate.setDate(endDate.getDate() + data.term);
      } else if (data.termUnit === 'MONTHS') {
        endDate.setMonth(endDate.getMonth() + data.term);
      } else if (data.termUnit === 'YEARS') {
        endDate.setFullYear(endDate.getFullYear() + data.term);
      }
    }

    // Calculate total charges
    const totalCharges = toTwoDecimals(
      (data.processingFee || 0) +
        (data.managementFee || 0) +
        (data.insuranceFee || 0) +
        (data.otherCharges || 0)
    );

    // Calculate total interest (simple interest)
    let totalInterest = 0;
    if (data.term && data.interestRate && data.termUnit) {
      const annualRate = data.interestRate / 100;
      let termInYears = 0;

      if (data.termUnit === 'DAYS') {
        termInYears = data.term / 365;
      } else if (data.termUnit === 'MONTHS') {
        termInYears = data.term / 12;
      } else if (data.termUnit === 'YEARS') {
        termInYears = data.term;
      }

      totalInterest = toTwoDecimals(
        data.principalAmount * annualRate * termInYears
      );
    }

    // Calculate current balance (principal + charges + interest)
    const currentBalance = toTwoDecimals(
      data.principalAmount + totalCharges + totalInterest
    );

    // Create loan
    const loan = await prisma.loan.create({
      data: {
        loanNumber,
        userId,
        loanType: data.loanType,

        // Single party details
        partyName: data.partyName,
        partyEmail: data.partyEmail || null,
        partyPhone: data.partyPhone || null,

        principalAmount: toTwoDecimals(data.principalAmount),
        interestRate: toTwoDecimals(data.interestRate),

        processingFee: toTwoDecimals(data.processingFee || 0),
        managementFee: toTwoDecimals(data.managementFee || 0),
        insuranceFee: toTwoDecimals(data.insuranceFee || 0),
        otherCharges: toTwoDecimals(data.otherCharges || 0),
        totalCharges,

        startDate,
        endDate,
        term: data.term || null,
        termUnit: data.termUnit || 'MONTHS',
        paymentFrequency: data.paymentFrequency,

        currentBalance,
        totalPaid: 0,
        totalInterestPaid: 0,

        status: 'ACTIVE',
        purpose: data.purpose || null,
        collateral: data.collateral || null,

        notes: data.notes || null,
      },
    });

    return NextResponse.json(
      {
        message: 'Loan created successfully',
        success: true,
        loan,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create loan error:', error);

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

// GET /api/loans - Get all loans with summary and chart data
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const loanType = searchParams.get('loanType');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (loanType) where.loanType = loanType;
    if (status) where.status = status;

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loan.count({ where }),
    ]);

    // Calculate summary statistics
    let totalReceivable = 0;
    let totalPayable = 0;
    let activeLoansReceivable = 0;
    let activeLoansPayable = 0;
    let totalInterestEarned = 0;
    let totalInterestPaid = 0;
    let outstandingReceivable = 0;
    let outstandingPayable = 0;

    const byStatus: Record<string, number> = {};
    const byFrequency: Record<string, number> = {};
    const byTypeData: Record<string, { value: number; count: number }> = {
      RECEIVABLE: { value: 0, count: 0 },
      PAYABLE: { value: 0, count: 0 },
    };
    const byStatusData: Record<string, { value: number; count: number }> = {};

    // Process all loans for summary
    loans.forEach(loan => {
      // By type aggregation
      if (loan.loanType === 'RECEIVABLE') {
        totalReceivable += loan.principalAmount;
        outstandingReceivable += loan.currentBalance;
        totalInterestEarned += loan.totalInterestPaid;
        if (loan.status === 'ACTIVE') activeLoansReceivable++;

        byTypeData.RECEIVABLE.value += loan.currentBalance;
        byTypeData.RECEIVABLE.count++;
      } else {
        totalPayable += loan.principalAmount;
        outstandingPayable += loan.currentBalance;
        totalInterestPaid += loan.totalInterestPaid;
        if (loan.status === 'ACTIVE') activeLoansPayable++;

        byTypeData.PAYABLE.value += loan.currentBalance;
        byTypeData.PAYABLE.count++;
      }

      // By status aggregation
      byStatus[loan.status] = (byStatus[loan.status] || 0) + 1;
      if (!byStatusData[loan.status]) {
        byStatusData[loan.status] = { value: 0, count: 0 };
      }
      byStatusData[loan.status].value += loan.currentBalance;
      byStatusData[loan.status].count++;

      // By frequency aggregation
      byFrequency[loan.paymentFrequency] =
        (byFrequency[loan.paymentFrequency] || 0) + 1;
    });

    // Calculate net position (what you're owed minus what you owe)
    const netLoanPosition = toTwoDecimals(
      outstandingReceivable - outstandingPayable
    );

    const summary = {
      totalReceivable: toTwoDecimals(totalReceivable),
      totalPayable: toTwoDecimals(totalPayable),
      activeLoansReceivable,
      activeLoansPayable,
      totalInterestEarned: toTwoDecimals(totalInterestEarned),
      totalInterestPaid: toTwoDecimals(totalInterestPaid),
      outstandingReceivable: toTwoDecimals(outstandingReceivable),
      outstandingPayable: toTwoDecimals(outstandingPayable),
      netLoanPosition,
      byStatus,
      byFrequency,
    };

    // Prepare chart data
    const byType = Object.entries(byTypeData).map(([name, data]) => ({
      name: name === 'RECEIVABLE' ? 'Receivable' : 'Payable',
      value: toTwoDecimals(data.value),
      count: data.count,
    }));

    const byStatusChart = Object.entries(byStatusData).map(([name, data]) => ({
      name: formatStatusName(name),
      value: toTwoDecimals(data.value),
      count: data.count,
    }));

    // Calculate repayment trend (last 12 months)
    const repaymentTrend = calculateRepaymentTrend(loans);

    const chartData = {
      byType,
      byStatus: byStatusChart,
      repaymentTrend,
    };

    // Prepare meta information
    const receivableCount = loans.filter(
      l => l.loanType === 'RECEIVABLE'
    ).length;
    const payableCount = loans.filter(l => l.loanType === 'PAYABLE').length;

    const meta = {
      type: 'loan' as const,
      totalRecords: total,
      receivableCount,
      payableCount,
      currency: 'NGN',
    };

    console.log('Fetched loans:', JSON.stringify(loans, null, 2));

    return NextResponse.json(
      {
        success: true,
        loans,
        summary,
        chartData,
        meta,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get loans error:', error);

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

// Helper function to format status names
function formatStatusName(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper function to calculate repayment trend
function calculateRepaymentTrend(loans: any[]) {
  const monthMap = new Map<string, { principal: number; interest: number }>();
  const now = new Date();

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = date.toISOString().slice(0, 7); // YYYY-MM format
    monthMap.set(key, { principal: 0, interest: 0 });
  }

  // Aggregate payments by month
  loans.forEach(loan => {
    loan.payments?.forEach((payment: any) => {
      const paymentDate = new Date(payment.paymentDate);
      const key = paymentDate.toISOString().slice(0, 7);

      if (monthMap.has(key)) {
        const current = monthMap.get(key)!;
        current.principal += payment.principalAmount || 0;
        current.interest += payment.interestAmount || 0;
      }
    });
  });

  // Convert to array format
  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month: new Date(month + '-01').toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
    principal: toTwoDecimals(data.principal),
    interest: toTwoDecimals(data.interest),
    total: toTwoDecimals(data.principal + data.interest),
  }));
}
