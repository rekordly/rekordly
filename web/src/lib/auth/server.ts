import { NextRequest } from 'next/server';
import { getToken, JWT } from 'next-auth/jwt';

interface AuthResult {
  token: JWT | null;
  userId: string;
  userEmail: string;
}


export async function getAuthUser(request: NextRequest): Promise<AuthResult> {
  
  let token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });


  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const jwtToken = authHeader.substring(7);
      
      token = await getToken({ 
        req: { 
          headers: { authorization: `Bearer ${jwtToken}` } 
        } as any, 
        secret: process.env.NEXTAUTH_SECRET 
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
}


export async function getAuthUserOptional(request: NextRequest): Promise<AuthResult | null> {
  try {
    return await getAuthUser(request);
  } catch {
    return null;
  }
}