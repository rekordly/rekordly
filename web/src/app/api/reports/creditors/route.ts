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

    // Fetch unpaid/partially paid Purchases
    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        balance: { gt: 0 },
        purchaseDate: {
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

    // Group by vendor
    const vendorMap = new Map<string, any>();

    purchases.forEach(purchase => {
      const vendorKey = purchase.vendorName || 'Unknown Vendor';

      if (!vendorMap.has(vendorKey)) {
        vendorMap.set(vendorKey, {
          vendorId: purchase.customerId, // If vendor is in Customer table with SUPPLIER role
          vendorName: purchase.vendorName,
          vendorEmail: purchase.vendorEmail,
          vendorPhone: purchase.vendorPhone,
          totalOutstanding: 0,
          numberOfPurchases: 0,
          oldestPurchaseDate: purchase.purchaseDate,
          current: 0,
          days30to60: 0,
          days60to90: 0,
          over90Days: 0,
          purchases: [],
        });
      }

      const vendor = vendorMap.get(vendorKey);
      vendor.totalOutstanding += purchase.balance;
      vendor.numberOfPurchases += 1;

      if (
        new Date(purchase.purchaseDate) < new Date(vendor.oldestPurchaseDate)
      ) {
        vendor.oldestPurchaseDate = purchase.purchaseDate;
      }

      const daysOutstanding = getDaysDifference(
        new Date(purchase.purchaseDate),
        now
      );
      const agingCategory = getAgingCategory(daysOutstanding);

      if (daysOutstanding <= 30) vendor.current += purchase.balance;
      else if (daysOutstanding <= 60) vendor.days30to60 += purchase.balance;
      else if (daysOutstanding <= 90) vendor.days60to90 += purchase.balance;
      else vendor.over90Days += purchase.balance;

      vendor.purchases.push({
        id: purchase.id,
        number: purchase.purchaseNumber,
        date: purchase.purchaseDate,
        title: purchase.title,
        description: purchase.description,
        totalAmount: purchase.totalAmount,
        amountPaid: purchase.amountPaid,
        balance: purchase.balance,
        status: purchase.status,
        daysOutstanding,
        agingCategory,
        payments: purchase.payments,
      });
    });

    // Convert map to array
    const data = Array.from(vendorMap.values())
      .map(vendor => ({
        ...vendor,
        totalOutstanding: toTwoDecimals(vendor.totalOutstanding),
        current: toTwoDecimals(vendor.current),
        days30to60: toTwoDecimals(vendor.days30to60),
        days60to90: toTwoDecimals(vendor.days60to90),
        over90Days: toTwoDecimals(vendor.over90Days),
        daysOutstanding: getDaysDifference(
          new Date(vendor.oldestPurchaseDate),
          now
        ),
        purchases: vendor.purchases.map((purch: any) => ({
          ...purch,
          totalAmount: toTwoDecimals(purch.totalAmount),
          amountPaid: toTwoDecimals(purch.amountPaid),
          balance: toTwoDecimals(purch.balance),
        })),
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // Calculate summary
    const totalOutstanding = toTwoDecimals(
      data.reduce((sum, d) => sum + d.totalOutstanding, 0)
    );
    const totalVendors = data.length;
    const averageDebt =
      totalVendors > 0 ? toTwoDecimals(totalOutstanding / totalVendors) : 0;

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
        purchases
          .filter(p => p.status === 'UNPAID')
          .reduce((sum, p) => sum + p.balance, 0)
      ),
      PARTIALLY_PAID: toTwoDecimals(
        purchases
          .filter(p => p.status === 'PARTIALLY_PAID')
          .reduce((sum, p) => sum + p.balance, 0)
      ),
    };

    const topCreditor = data.length > 0 ? data[0] : null;

    const summary = {
      totalOutstanding,
      totalVendors,
      averageDebt,
      current,
      days30to60,
      days60to90,
      over90Days,
      byStatus,
      topCreditor: topCreditor
        ? {
            name: topCreditor.vendorName,
            amount: topCreditor.totalOutstanding,
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
      topCreditors: data.slice(0, 10).map(d => ({
        name: d.vendorName,
        amount: d.totalOutstanding,
      })),
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'creditors',
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
    console.error('Get creditors report error:', error);
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
