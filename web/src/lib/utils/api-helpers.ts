// lib/utils/api-helpers.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/utils/server';
import { getDateRange } from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';

/**
 * Standard API response wrapper
 */
export function apiResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Standard error response
 */
export function apiError(message: string, status = 500) {
  return NextResponse.json({ message }, { status });
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown) {
  console.error('API error:', error);

  if (error instanceof z.ZodError) {
    const flatErrors = error.flatten().fieldErrors;
    const firstError = Object.values(flatErrors).flat()[0];

    const message =
      typeof firstError === 'string' ? firstError : 'Invalid input';

    return apiError(message, 400);
  }

  if (error instanceof Error) {
    if (error.message.includes('Unauthorized')) {
      return apiError(error.message, 401);
    }
    return apiError(error.message, 500);
  }

  return apiError('Internal server error', 500);
}

/**
 * Parse and validate request query params for reports
 */
export async function parseReportQuery(request: NextRequest) {
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

  return {
    userId,
    queryParams,
    startDate,
    endDate,
  };
}

/**
 * Create standard meta object for report responses
 */
export function createReportMeta(
  type: string,
  range: string,
  startDate: Date,
  endDate: Date,
  additionalMeta?: Record<string, any>
) {
  return {
    type,
    range,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    currency: 'NGN',
    ...additionalMeta,
  };
}
