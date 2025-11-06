// app/api/auth/error/route.ts
import type { NextRequest } from 'next/server';

import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error');

  // Redirect to account page with error parameter
  const accountUrl = new URL('/account', request.url);

  if (error) {
    accountUrl.searchParams.set('error', error);
  }

  return NextResponse.redirect(accountUrl);
}
