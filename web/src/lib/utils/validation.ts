import { z } from 'zod';
import { NextResponse, NextRequest } from 'next/server';

export async function validateRequest<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  const body = await request.json();
  console.log(JSON.stringify(body, null, 2));
  const result = schema.safeParse(body);

  if (!result.success) {
    const flatErrors = result.error.flatten().fieldErrors;
    const message = Object.values(flatErrors).flat()[0] || 'Invalid input';
    console.warn('Validation failed:', flatErrors);

    throw NextResponse.json(
      { error: 'Validation failed', message },
      { status: 400 }
    );
  }

  return result.data;
}
