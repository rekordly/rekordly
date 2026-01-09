import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'rekordly-web',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      features: {
        inventory: true,
        production: true,
        sales: true,
        purchases: true,
        quotations: true,
        storefront: true,
      },
    },
    { status: 200 }
  );
}
