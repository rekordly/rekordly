import NextAuth, { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import TwitterProvider from 'next-auth/providers/twitter';
import AppleProvider from 'next-auth/providers/apple';
import EmailProvider from 'next-auth/providers/email';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';
import { sendOtpCode } from '@/lib/auth/otp';
import { OTPProvider } from '@/lib/auth/otpAuth';
import { sendVerificationRequest } from '@/lib/auth/email-provider-custom';

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/account',
    signOut: '/account',
    error: '/account',
    verifyRequest: '/account',
    newUser: '/onboarding',
  },

  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      // Use custom email template
      sendVerificationRequest,
    }),

    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      type: 'credentials' as const,
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              emailVerified: true,
              onboarded: true,
              password: true,
              onboarding: {
                select: {
                  businessName: true,
                  phoneNumber: true,
                  registrationType: true,
                  workTypes: true,
                  startDate: true,
                  bankDetails: true,
                  referralCode: true,
                },
              },
            },
          });

          // User not found - create account and send OTP
          if (!user) {
            try {
              const hashedPassword = await bcrypt.hash(
                credentials.password,
                10
              );

              await prisma.user.create({
                data: {
                  email: credentials.email!,
                  password: hashedPassword,
                  onboarded: false,
                },
              });

              await sendOtpCode(credentials.email, 'login_recovery');
              throw new Error(
                'Account Created Successfully! Check your email for the confirmation code.'
              );
            } catch (error) {
              console.error('User creation error:', error);
              if (
                error instanceof Error &&
                error.message.includes("Can't reach database server")
              ) {
                throw new Error(
                  'Database connection error. Please try again later.'
                );
              }
              // Re-throw if it's our success message
              if (
                error instanceof Error &&
                error.message.includes('Account Created Successfully')
              ) {
                throw error;
              }
              throw new Error('Failed to create account. Please try again.');
            }
          }

          // If user has no password (social login only), send OTP
          if (!user.password) {
            await sendOtpCode(credentials.email, 'login_recovery');
            throw new Error(
              'No password set. Check your email for the login code.'
            );
          }

          // If email not verified, send OTP
          if (!user.emailVerified) {
            await sendOtpCode(credentials.email, 'login_recovery');
            throw new Error(
              'Email not verified. Check your email for the login code.'
            );
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isValid) {
            throw new Error('Invalid credentials');
          }

          return {
            id: user.id,
            email: user.email!,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            emailVerified: user.emailVerified ?? undefined,
            onboarded: user.onboarded,
            password: user.password,
            hasPassword: !!user.password,
            onboarding: user.onboarding
              ? {
                  businessName: user.onboarding.businessName,
                  phoneNumber: user.onboarding.phoneNumber,
                  registrationType: user.onboarding.registrationType,
                  workTypes: user.onboarding.workTypes,
                  startDate: user.onboarding.startDate,
                  bankDetails: user.onboarding.bankDetails,
                  referralCode: user.onboarding.referralCode,
                }
              : undefined,
          };
        } catch (error) {
          console.error('Credentials authorization error:', error);
          if (
            error instanceof Error &&
            error.message.includes("Can't reach database server")
          ) {
            throw new Error(
              'Database connection error. Please try again later.'
            );
          }
          if (error instanceof Error) {
            throw new Error(error.message);
          }
          throw new Error('An error occurred during authentication');
        }
      },
    }),

    // Custom OTP provider
    OTPProvider,

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: '2.0',
    }),

    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
          include: { accounts: true },
        });

        // Social login
        if (account && account.type === 'oauth') {
          if (existingUser) {
            const hasProvider = existingUser.accounts.some(
              acc => acc.provider === account.provider
            );

            if (hasProvider) {
              return true;
            }

            await prisma.account.create({
              data: {
                userId: existingUser.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                type: account.type,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            });

            if (!existingUser.emailVerified) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: { emailVerified: new Date() },
              });
            }

            return true;
          }

          await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name ?? '',
              image: user.image,
              emailVerified: new Date(),
              onboarded: false,
            },
          });

          return true;
        }

        // Email provider
        if (account && account.type === 'email') {
          if (!existingUser) {
            await prisma.user.create({
              data: {
                email: user.email!,
                name: user.name ?? '',
                onboarded: false,
              },
            });
          }

          return true;
        }

        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        if (
          error instanceof Error &&
          error.message.includes("Can't reach database server")
        ) {
          return `/account?error=${encodeURIComponent('Database connection error. Please try again later.')}`;
        }

        return `/account?error=${encodeURIComponent('An error occurred during sign in')}`;
      }
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.onboarded = user.onboarded ?? false;
        token.hasPassword = !!user.password;
        token.emailVerified = !!user.emailVerified;
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;

        if (user.onboarding) {
          token.onboarding = user.onboarding;
        } else {
          try {
            const onboardingData = await prisma.onboardingData.findUnique({
              where: { userId: user.id },
              select: {
                businessName: true,
                phoneNumber: true,
                registrationType: true,
                workTypes: true,
                startDate: true,
                bankDetails: true,
                referralCode: true,
              },
            });

            token.onboarding = onboardingData || {
              businessName: null,
              phoneNumber: null,
              registrationType: null,
              workTypes: null,
              startDate: null,
              bankDetails: null,
              referralCode: null,
            };
          } catch (error) {
            console.error('Error fetching onboarding data in JWT:', error);
            token.onboarding = {
              businessName: null,
              phoneNumber: null,
              registrationType: null,
              workTypes: null,
              startDate: null,
              bankDetails: null,
              referralCode: null,
            };
          }
        }
      }

      if (trigger === 'update') {
        try {
          const updatedUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              onboarded: true,
              password: true,
              emailVerified: true,
              name: true,
              onboarding: {
                select: {
                  businessName: true,
                  phoneNumber: true,
                  registrationType: true,
                  workTypes: true,
                  startDate: true,
                  bankDetails: true,
                  referralCode: true,
                },
              },
            },
          });

          if (updatedUser) {
            token.onboarded = updatedUser.onboarded;
            token.hasPassword = !!updatedUser.password;
            token.emailVerified = !!updatedUser.emailVerified;
            token.name = updatedUser.name;
            token.onboarding = {
              businessName: updatedUser.onboarding?.businessName || null,
              phoneNumber: updatedUser.onboarding?.phoneNumber || null,
              registrationType:
                updatedUser.onboarding?.registrationType || null,
              workTypes: updatedUser.onboarding?.workTypes || null,
              startDate: updatedUser.onboarding?.startDate || null,
              bankDetails: updatedUser.onboarding?.bankDetails || null,
              referralCode: updatedUser.onboarding?.referralCode || null,
            };
          }
        } catch (error) {
          console.error('JWT callback error:', error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id;
        session.user.onboarded = token.onboarded;
        session.user.hasPassword = token.hasPassword;
        session.user.emailVerified = !!token.emailVerified;
        session.user.onboarding = token.onboarding;
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
      }

      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
