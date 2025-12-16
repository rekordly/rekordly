import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import {
  getDateRange,
  getDaysDifference,
  getAgingCategory,
} from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const searchParams = request.nextUrl.searchParams;
    const queryParams = reportQuerySchema.parse({
      range: searchParams.get('range') || 'thisYear',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    const { startDate, endDate } = getDateRange(
      queryParams.range,
      queryParams.startDate,
      queryParams.endDate
    );

    const now = new Date();

    // Fetch unpaid/partially paid Sales
    const sales = await prisma.sale.findMany({
      where: {
        userId,
        balance: { gt: 0 },
        saleDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['UNPAID', 'PARTIALLY_PAID'],
        },
      },
      include: {
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    // Fetch unpaid/partially paid Quotations
    const quotations = await prisma.quotation.findMany({
      where: {
        userId,
        balance: { gt: 0 },
        issueDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['UNPAID', 'PARTIALLY_PAID'],
        },
      },
      include: {
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    // Group by customer
    const customerMap = new Map<string, any>();

    // Process Sales
    sales.forEach(sale => {
      const customerKey = sale.customerName || 'Unknown Customer';

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          customerId: sale.customerId,
          customerName: sale.customerName,
          customerEmail: sale.customerEmail,
          customerPhone: sale.customerPhone,
          totalOutstanding: 0,
          numberOfInvoices: 0,
          oldestInvoiceDate: sale.saleDate,
          current: 0,
          days30to60: 0,
          days60to90: 0,
          over90Days: 0,
          invoices: [],
        });
      }

      const customer = customerMap.get(customerKey);
      customer.totalOutstanding += sale.balance;
      customer.numberOfInvoices += 1;

      // Update oldest date
      if (new Date(sale.saleDate) < new Date(customer.oldestInvoiceDate)) {
        customer.oldestInvoiceDate = sale.saleDate;
      }

      const daysOutstanding = getDaysDifference(new Date(sale.saleDate), now);
      const agingCategory = getAgingCategory(daysOutstanding);

      // Categorize by aging
      if (daysOutstanding <= 30) customer.current += sale.balance;
      else if (daysOutstanding <= 60) customer.days30to60 += sale.balance;
      else if (daysOutstanding <= 90) customer.days60to90 += sale.balance;
      else customer.over90Days += sale.balance;

      customer.invoices.push({
        type: 'SALE',
        id: sale.id,
        number: sale.receiptNumber,
        date: sale.saleDate,
        dueDate: null,
        title: sale.title,
        totalAmount: sale.totalAmount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        status: sale.status,
        daysOverdue: daysOutstanding,
        agingCategory,
        payments: sale.payments,
      });
    });

    // Process Quotations
    quotations.forEach(quotation => {
      const customerKey = quotation.customerName || 'Unknown Customer';

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          customerId: quotation.customerId,
          customerName: quotation.customerName,
          customerEmail: quotation.customerEmail,
          customerPhone: quotation.customerPhone,
          totalOutstanding: 0,
          numberOfInvoices: 0,
          oldestInvoiceDate: quotation.issueDate,
          current: 0,
          days30to60: 0,
          days60to90: 0,
          over90Days: 0,
          invoices: [],
        });
      }

      const customer = customerMap.get(customerKey);
      customer.totalOutstanding += quotation.balance;
      customer.numberOfInvoices += 1;

      if (
        new Date(quotation.issueDate) < new Date(customer.oldestInvoiceDate)
      ) {
        customer.oldestInvoiceDate = quotation.issueDate;
      }

      const daysOutstanding = getDaysDifference(
        new Date(quotation.issueDate),
        now
      );
      const agingCategory = getAgingCategory(daysOutstanding);

      if (daysOutstanding <= 30) customer.current += quotation.balance;
      else if (daysOutstanding <= 60) customer.days30to60 += quotation.balance;
      else if (daysOutstanding <= 90) customer.days60to90 += quotation.balance;
      else customer.over90Days += quotation.balance;

      customer.invoices.push({
        type: 'QUOTATION',
        id: quotation.id,
        number: quotation.quotationNumber,
        date: quotation.issueDate,
        dueDate: quotation.validUntil,
        title: quotation.title,
        totalAmount: quotation.totalAmount,
        amountPaid: quotation.amountPaid,
        balance: quotation.balance,
        status: quotation.status,
        daysOverdue: daysOutstanding,
        agingCategory,
        payments: quotation.payments,
      });
    });

    // Convert map to array and calculate days outstanding
    const data = Array.from(customerMap.values())
      .map(customer => ({
        ...customer,
        totalOutstanding: toTwoDecimals(customer.totalOutstanding),
        current: toTwoDecimals(customer.current),
        days30to60: toTwoDecimals(customer.days30to60),
        days60to90: toTwoDecimals(customer.days60to90),
        over90Days: toTwoDecimals(customer.over90Days),
        daysOutstanding: getDaysDifference(
          new Date(customer.oldestInvoiceDate),
          now
        ),
        invoices: customer.invoices.map((inv: any) => ({
          ...inv,
          totalAmount: toTwoDecimals(inv.totalAmount),
          amountPaid: toTwoDecimals(inv.amountPaid),
          balance: toTwoDecimals(inv.balance),
        })),
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // Calculate summary
    const totalOutstanding = toTwoDecimals(
      data.reduce((sum, d) => sum + d.totalOutstanding, 0)
    );
    const totalCustomers = data.length;
    const averageDebt =
      totalCustomers > 0 ? toTwoDecimals(totalOutstanding / totalCustomers) : 0;

    const current = toTwoDecimals(data.reduce((sum, d) => sum + d.current, 0));
    const days30to60 = toTwoDecimals(
      data.reduce((sum, d) => sum + d.days30to60, 0)
    );
    const days60to90 = toTwoDecimals(
      data.reduce((sum, d) => sum + d.days60to90, 0)
    );
    const over90Days = toTwoDecimals(
      data.reduce((sum, d) => sum + d.over90Days, 0)
    );

    const byStatus = {
      UNPAID: toTwoDecimals(
        [...sales, ...quotations]
          .filter(item => item.status === 'UNPAID')
          .reduce((sum, item) => sum + item.balance, 0)
      ),
      PARTIALLY_PAID: toTwoDecimals(
        [...sales, ...quotations]
          .filter(item => item.status === 'PARTIALLY_PAID')
          .reduce((sum, item) => sum + item.balance, 0)
      ),
    };

    const topDebtor = data.length > 0 ? data[0] : null;

    const summary = {
      totalOutstanding,
      totalCustomers,
      averageDebt,
      current,
      days30to60,
      days60to90,
      over90Days,
      byStatus,
      topDebtor: topDebtor
        ? {
            name: topDebtor.customerName,
            amount: topDebtor.totalOutstanding,
          }
        : null,
    };

    const chartData = {
      aging: [
        {
          range: '0-30 days',
          amount: current,
          percentage:
            totalOutstanding > 0
              ? toTwoDecimals((current / totalOutstanding) * 100)
              : 0,
        },
        {
          range: '30-60 days',
          amount: days30to60,
          percentage:
            totalOutstanding > 0
              ? toTwoDecimals((days30to60 / totalOutstanding) * 100)
              : 0,
        },
        {
          range: '60-90 days',
          amount: days60to90,
          percentage:
            totalOutstanding > 0
              ? toTwoDecimals((days60to90 / totalOutstanding) * 100)
              : 0,
        },
        {
          range: '90+ days',
          amount: over90Days,
          percentage:
            totalOutstanding > 0
              ? toTwoDecimals((over90Days / totalOutstanding) * 100)
              : 0,
        },
      ],
      topDebtors: data.slice(0, 10).map(d => ({
        name: d.customerName,
        amount: d.totalOutstanding,
      })),
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'debtors',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: data.length,
          currency: 'NGN',
        },
        summary,
        chartData,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get debtors report error:', error);

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
