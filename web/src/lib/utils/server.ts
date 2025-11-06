import { NextRequest } from 'next/server';
import { getToken, JWT } from 'next-auth/jwt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthResult {
  token: JWT | null;
  userId: string;
  userEmail: string;
}

export async function getAuthUser(request: NextRequest): Promise<AuthResult> {
  let token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const authHeader = request.headers.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
      const jwtToken = authHeader.substring(7);

      token = await getToken({
        req: {
          headers: { authorization: `Bearer ${jwtToken}` },
        } as any,
        secret: process.env.NEXTAUTH_SECRET,
      });
    }
  }

  if (!token?.sub || !token?.email) {
    throw new Error('Unauthorized - No valid session or token');
  }

  return {
    token,
    userId: token.sub,
    userEmail: token.email,
  };

  // try {
  //   const user = await prisma.user.findUnique({
  //     where: { id: token.sub },
  //     select: { id: true, email: true },
  //   });

  //   if (!user) {
  //     throw new Error('Unauthorized - User not found');
  //   }

  //   return {
  //     token,
  //     userId: user.id,
  //     userEmail: user.email || token.email,
  //   };
  // } catch (error) {
  //   throw new Error('Unauthorized - Invalid user session');
  // } finally {
  //   await prisma.$disconnect();
  // }
}

export async function getAuthUserOptional(
  request: NextRequest
): Promise<AuthResult | null> {
  try {
    return await getAuthUser(request);
  } catch {
    return null;
  }
}
