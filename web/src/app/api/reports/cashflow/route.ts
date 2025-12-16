import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import {
  getDateRange,
  calculateMonthlyData,
  getMonthCount,
} from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';

export async function GET(request: NextRequest) {
  try {
    const { userId, registrationType } = await getAuthUser(request);

    // Check if user is a limited company type that needs equity tracking
    const isLimitedCompany = [
      'Limited Liability Company (Ltd)',
      'Public Limited Company (PLC)',
      'Limited by Guarantee',
      'Unlimited Company',
      'Limited Liability Partnership (LLP)',
    ].includes(registrationType || '');

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const queryParams = reportQuerySchema.parse({
      range: searchParams.get('range') || 'thisYear',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    // Calculate date range
    const { startDate, endDate } = getDateRange(
      queryParams.range,
      queryParams.startDate,
      queryParams.endDate
    );

    // ============================================
    // FETCH ALL DATA
    // ============================================

    // Fetch all payments (this is the core of cash flow)
    const allPayments = await prisma.payment.findMany({
      where: {
        userId,
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        sale: true,
        quotation: true,
        purchase: true,
        income: true,
        expenses: true,
        loan: true,
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    // Fetch fixed asset purchases and disposals
    const assetPurchases = await prisma.fixedAsset.findMany({
      where: {
        userId,
        acquisitionDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        acquisitionDate: 'desc',
      },
    });

    const assetDisposals = await prisma.fixedAsset.findMany({
      where: {
        userId,
        disposalDate: {
          gte: startDate,
          lte: endDate,
          not: null,
        },
      },
      orderBy: {
        disposalDate: 'desc',
      },
    });

    // Fetch owner equity transactions (only for Ltd/PLC)
    let ownerEquityTransactions: any[] = [];
    if (isLimitedCompany) {
      ownerEquityTransactions = await prisma.ownerEquity.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          date: 'desc',
        },
      });
    }

    // ============================================
    // TRANSFORM DATA TO CASH FLOW ITEMS
    // ============================================

    interface CashFlowItem {
      id: string;
      date: Date;
      amount: number;
      flowType: 'INFLOW' | 'OUTFLOW';
      flowCategory: 'OPERATING' | 'INVESTING' | 'FINANCING';
      subCategory: string;
      description: string;
      sourceType: string;
      sourceId: string;
      paymentMethod: string | null;
      reference: string | null;
      notes: string | null;
      sourceNumber?: string;
      customerName?: string;
      vendorName?: string;
      incomeCategory?: string;
      incomeSubCategory?: string;
      expenseCategory?: string;
      assetCategory?: string;
      capitalGain?: number | null;
      loanNumber?: string;
      shareholderName?: string | null;
    }

    const cashFlowItems: CashFlowItem[] = [];

    // Process payments
    allPayments.forEach(payment => {
      const item: CashFlowItem = {
        id: payment.id,
        date: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        notes: payment.notes,
        flowType: 'INFLOW',
        flowCategory: 'OPERATING',
        subCategory: '',
        description: '',
        sourceType: '',
        sourceId: '',
      };

      // Determine cash flow category and type based on payment
      if (payment.category === 'INCOME') {
        item.flowType = 'INFLOW';
        item.flowCategory = 'OPERATING';

        if (payment.saleId && payment.sale) {
          // Check if this is a refund
          if (payment.sale.refundAmount && payment.sale.refundAmount > 0) {
            item.amount = -Math.abs(payment.amount); // Negative inflow
            item.subCategory = 'REFUND';
            item.description = `Refund - Sale ${payment.sale.receiptNumber}`;
            item.sourceType = 'SALE_REFUND';
          } else {
            item.subCategory = 'CUSTOMER_PAYMENT';
            item.description = `Payment from ${payment.sale.customerName || 'Customer'} - Sale ${payment.sale.receiptNumber}`;
            item.sourceType = 'SALE';
          }
          item.sourceId = payment.sale.id;
          item.sourceNumber = payment.sale.receiptNumber;
          item.customerName = payment.sale.customerName || '';
        } else if (payment.quotationId && payment.quotation) {
          // Check if this is a refund
          if (
            payment.quotation.refundAmount &&
            payment.quotation.refundAmount > 0
          ) {
            item.amount = -Math.abs(payment.amount); // Negative inflow
            item.subCategory = 'REFUND';
            item.description = `Refund - Quotation ${payment.quotation.quotationNumber}`;
            item.sourceType = 'QUOTATION_REFUND';
          } else {
            item.subCategory = 'CUSTOMER_PAYMENT';
            item.description = `Payment from ${payment.quotation.customerName || 'Customer'} - Quotation ${payment.quotation.quotationNumber}`;
            item.sourceType = 'QUOTATION';
          }
          item.sourceId = payment.quotation.id;
          item.sourceNumber = payment.quotation.quotationNumber;
          item.customerName = payment.quotation.customerName || '';
        } else if (payment.incomeId && payment.income) {
          item.subCategory = 'OTHER_INCOME';
          item.description = payment.income.description || 'Other Income';
          item.sourceType = 'OTHER_INCOME';
          item.sourceId = payment.income.id;
          item.incomeCategory = payment.income.mainCategory;
          item.incomeSubCategory = payment.income.subCategory;
        } else if (
          payment.loanId &&
          payment.loan &&
          payment.loan.loanType === 'RECEIVABLE'
        ) {
          // Loan repayment received (someone paying us back)
          item.flowCategory = 'FINANCING';
          item.subCategory = 'LOAN_REPAYMENT_RECEIVED';
          item.description = `Loan repayment from ${payment.loan.partyName || 'Borrower'}`;
          item.sourceType = 'LOAN_RECEIVABLE';
          item.sourceId = payment.loan.id;
          item.loanNumber = payment.loan.loanNumber;
        }
      } else if (payment.category === 'EXPENSE') {
        item.flowType = 'OUTFLOW';
        item.flowCategory = 'OPERATING';

        if (payment.purchaseId && payment.purchase) {
          // Check if this is a refund/return
          if (
            payment.purchase.refundAmount &&
            payment.purchase.refundAmount > 0
          ) {
            item.flowType = 'INFLOW'; // Returns are inflows
            item.subCategory = 'PURCHASE_RETURN';
            item.description = `Return - Purchase ${payment.purchase.purchaseNumber}`;
            item.sourceType = 'PURCHASE_RETURN';
          } else {
            item.subCategory = 'SUPPLIER_PAYMENT';
            item.description = `Payment to ${payment.purchase.vendorName} - Purchase ${payment.purchase.purchaseNumber}`;
            item.sourceType = 'PURCHASE';
          }
          item.sourceId = payment.purchase.id;
          item.sourceNumber = payment.purchase.purchaseNumber;
          item.vendorName = payment.purchase.vendorName;
        } else if (payment.expensesId && payment.expenses) {
          // Check if this is a return
          if (payment.expenses.isReturn) {
            item.flowType = 'INFLOW'; // Returns are inflows
            item.subCategory = 'EXPENSE_RETURN';
            item.description = `Return - ${payment.expenses.description}`;
            item.sourceType = 'EXPENSE_RETURN';
          } else {
            item.subCategory = payment.expenses.category;
            item.description = payment.expenses.description;
            item.sourceType = 'EXPENSE';
          }
          item.sourceId = payment.expenses.id;
          item.expenseCategory = payment.expenses.category;
          item.vendorName = payment.expenses.vendorName || '';
        } else if (
          payment.loanId &&
          payment.loan &&
          payment.loan.loanType === 'PAYABLE'
        ) {
          // Loan repayment made (we're paying back)
          item.flowCategory = 'FINANCING';
          item.subCategory = 'LOAN_REPAYMENT_MADE';
          item.description = `Loan repayment to ${payment.loan.partyName || 'Lender'}`;
          item.sourceType = 'LOAN_PAYABLE';
          item.sourceId = payment.loan.id;
          item.loanNumber = payment.loan.loanNumber;
        }
      }

      cashFlowItems.push(item);
    });

    // Process asset purchases
    assetPurchases.forEach(asset => {
      cashFlowItems.push({
        id: asset.id,
        date: asset.acquisitionDate,
        amount: asset.acquisitionCost,
        flowType: 'OUTFLOW',
        flowCategory: 'INVESTING',
        subCategory: 'ASSET_PURCHASE',
        description: `Purchase of ${asset.name}`,
        sourceType: 'FIXED_ASSET_PURCHASE',
        sourceId: asset.id,
        assetCategory: asset.category,
        paymentMethod: null,
        reference: null,
        notes: asset.description,
      });
    });

    // Process asset disposals
    assetDisposals.forEach(asset => {
      if (asset.disposalProceeds) {
        cashFlowItems.push({
          id: `disposal-${asset.id}`,
          date: asset.disposalDate || new Date(),
          amount: asset.disposalProceeds,
          flowType: 'INFLOW',
          flowCategory: 'INVESTING',
          subCategory: 'ASSET_SALE',
          description: `Sale of ${asset.name}`,
          sourceType: 'FIXED_ASSET_SALE',
          sourceId: asset.id,
          assetCategory: asset.category,
          capitalGain: asset.capitalGain,
          paymentMethod: null,
          reference: null,
          notes: asset.description,
        });
      }
    });

    // Process owner equity transactions (only for Ltd/PLC)
    if (isLimitedCompany) {
      ownerEquityTransactions.forEach(equity => {
        const isInflow = equity.type === 'CAPITAL_INJECTION';

        cashFlowItems.push({
          id: equity.id,
          date: equity.date,
          amount: equity.amount,
          flowType: isInflow ? 'INFLOW' : 'OUTFLOW',
          flowCategory: 'FINANCING',
          subCategory: equity.type,
          description: equity.description || equity.type.replace(/_/g, ' '),
          sourceType: equity.type,
          sourceId: equity.id,
          shareholderName: equity.shareholderName,
          paymentMethod: null,
          reference: equity.reference,
          notes: equity.notes,
        });
      });
    }

    // Sort all items by date (newest first)
    cashFlowItems.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // ============================================
    // CALCULATE SUMMARY TOTALS
    // ============================================

    let operatingInflows = 0;
    let operatingOutflows = 0;
    let investingInflows = 0;
    let investingOutflows = 0;
    let financingInflows = 0;
    let financingOutflows = 0;

    cashFlowItems.forEach(item => {
      const amount = Math.abs(item.amount);

      if (item.flowCategory === 'OPERATING') {
        if (item.flowType === 'INFLOW') {
          operatingInflows += amount;
        } else {
          operatingOutflows += amount;
        }
      } else if (item.flowCategory === 'INVESTING') {
        if (item.flowType === 'INFLOW') {
          investingInflows += amount;
        } else {
          investingOutflows += amount;
        }
      } else if (item.flowCategory === 'FINANCING') {
        if (item.flowType === 'INFLOW') {
          financingInflows += amount;
        } else {
          financingOutflows += amount;
        }
      }
    });

    operatingInflows = toTwoDecimals(operatingInflows);
    operatingOutflows = toTwoDecimals(operatingOutflows);
    investingInflows = toTwoDecimals(investingInflows);
    investingOutflows = toTwoDecimals(investingOutflows);
    financingInflows = toTwoDecimals(financingInflows);
    financingOutflows = toTwoDecimals(financingOutflows);

    const netOperating = toTwoDecimals(operatingInflows - operatingOutflows);
    const netInvesting = toTwoDecimals(investingInflows - investingOutflows);
    const netFinancing = toTwoDecimals(financingInflows - financingOutflows);

    const netCashFlow = toTwoDecimals(
      netOperating + netInvesting + netFinancing
    );

    // Calculate by payment method breakdown
    const byPaymentMethod = {} as Record<string, number>;
    cashFlowItems.forEach(item => {
      if (item.paymentMethod && item.flowType === 'INFLOW') {
        byPaymentMethod[item.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[item.paymentMethod] || 0) + Math.abs(item.amount)
        );
      }
    });

    // Calculate monthly data for charts
    const monthlyData = calculateMonthlyData(
      cashFlowItems.map(item => ({
        paymentDate: item.date,
        amount:
          item.flowType === 'INFLOW'
            ? Math.abs(item.amount)
            : -Math.abs(item.amount),
        paymentMethod: item.paymentMethod || 'OTHER',
      })),
      startDate,
      endDate
    );

    // Calculate category breakdown for chart
    const categoryBreakdown = [
      {
        name: 'Operating Activities',
        inflow: operatingInflows,
        outflow: operatingOutflows,
        net: netOperating,
      },
      {
        name: 'Investing Activities',
        inflow: investingInflows,
        outflow: investingOutflows,
        net: netInvesting,
      },
      {
        name: 'Financing Activities',
        inflow: financingInflows,
        outflow: financingOutflows,
        net: netFinancing,
      },
    ];

    const summary = {
      operating: {
        inflows: operatingInflows,
        outflows: operatingOutflows,
        net: netOperating,
      },
      investing: {
        inflows: investingInflows,
        outflows: investingOutflows,
        net: netInvesting,
      },
      financing: {
        inflows: financingInflows,
        outflows: financingOutflows,
        net: netFinancing,
      },
      totalInflows: toTwoDecimals(
        operatingInflows + investingInflows + financingInflows
      ),
      totalOutflows: toTwoDecimals(
        operatingOutflows + investingOutflows + financingOutflows
      ),
      netCashFlow,
      averagePerMonth: toTwoDecimals(
        netCashFlow / getMonthCount(startDate, endDate)
      ),
      byPaymentMethod,
    };

    const chartData = {
      monthly: monthlyData,
      byCategory: categoryBreakdown,
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'cashflow',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: cashFlowItems.length,
          registrationType,
          includesOwnerEquity: isLimitedCompany,
          currency: 'NGN',
        },
        summary,
        chartData,
        data: cashFlowItems,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get cash flow report error:', error);

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
