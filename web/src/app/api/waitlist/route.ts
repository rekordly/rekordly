// app/api/waitlist/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { validateRequest } from '@/lib/utils/validation';
import { waitlistSchema } from '@/lib/validations/waitlist';
import { sendWaitlistEmail } from '@/lib/email/send-waitlist';

export async function POST(request: NextRequest) {
  try {
    const data = await validateRequest(request, waitlistSchema);

    // Extract metadata
    const userAgent = request.headers.get('user-agent') || undefined;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : request.headers.get('x-real-ip') || undefined;
    const referrer = request.headers.get('referer') || undefined;

    // Check if email already exists
    const existingEntry = await prisma.waitlist.findUnique({
      where: { email: data.email },
    });

    if (existingEntry) {
      // Update existing entry instead of creating new one
      const updatedEntry = await prisma.waitlist.update({
        where: { email: data.email },
        data: {
          name: data.name,
          phoneNumber: data.phoneNumber,
          userAgent,
          ipAddress,
          referrer,
        },
      });

      return NextResponse.json(
        {
          message:
            "You're already on the waitlist! We've updated your information.",
          success: true,
          waitlist: {
            id: updatedEntry.id,
            name: updatedEntry.name,
            email: updatedEntry.email,
          },
        },
        { status: 200 }
      );
    }

    // Create new waitlist entry
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        name: data.name,
        email: data.email,
        phoneNumber: data.phoneNumber,
        userAgent,
        ipAddress,
        referrer,
        source: 'landing_page',
      },
    });

    // Send welcome email
    try {
      await sendWaitlistEmail({
        name: waitlistEntry.name,
        email: waitlistEntry.email,
      });
    } catch (emailError) {
      console.error('Failed to send waitlist email:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        message: 'Successfully joined the waitlist!',
        success: true,
        waitlist: {
          id: waitlistEntry.id,
          name: waitlistEntry.name,
          email: waitlistEntry.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Waitlist signup error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: 'Failed to join waitlist. Please try again.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Optional: GET endpoint to retrieve waitlist stats (admin only)
export async function GET(request: NextRequest) {
  try {
    // Add authentication check here if needed

    const total = await prisma.waitlist.count();
    const pending = await prisma.waitlist.count({
      where: { status: 'PENDING' },
    });
    const notified = await prisma.waitlist.count({
      where: { status: 'NOTIFIED' },
    });
    const converted = await prisma.waitlist.count({
      where: { status: 'CONVERTED' },
    });

    return NextResponse.json({
      total,
      pending,
      notified,
      converted,
      stats: {
        conversionRate:
          total > 0 ? ((converted / total) * 100).toFixed(2) : '0.00',
      },
    });
  } catch (error) {
    console.error('Waitlist stats error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch waitlist stats' },
      { status: 500 }
    );
  }
}
