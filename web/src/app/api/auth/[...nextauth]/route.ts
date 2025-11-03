import NextAuth, { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import TwitterProvider from 'next-auth/providers/twitter';
import AppleProvider from 'next-auth/providers/apple';
import EmailProvider from 'next-auth/providers/email';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendOtpCode } from '@/lib/auth/otp';
import { OTPProvider } from '@/lib/auth/otpAuth';

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },

  // Add custom pages to prevent default error redirects
  pages: {
    signIn: '/account',
    signOut: '/account',
    error: '/account', // Error code passed in query string as ?error=
    verifyRequest: '/account', // Used for check email page
    newUser: '/onboarding', // New users will be directed here on first sign in
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
    }),

    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      type: 'credentials' as const, // Use 'as const' to ensure literal type
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
                },
              },
            },
          });

          // User not found
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
                'Account Created Successfully!. Check your email for the confirmation code.'
              );
            } catch (error) {
              // Handle database connection errors
              console.error('User creation error:', error);
              if (
                error instanceof Error &&
                error.message.includes("Can't reach database server")
              ) {
                throw new Error(
                  'Database connection error. Please try again later.'
                );
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

          // Transform null to undefined for NextAuth compatibility
          return {
            id: user.id,
            email: user.email!,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            emailVerified: user.emailVerified ?? undefined,
            onboarded: user.onboarded,
            password: user.password,
            onboarding: user.onboarding
              ? {
                  businessName: user.onboarding.businessName,
                  phoneNumber: user.onboarding.phoneNumber,
                  registrationType: user.onboarding.registrationType,
                  workTypes: user.onboarding.workTypes,
                  startDate: user.onboarding.startDate,
                }
              : undefined,
          };
        } catch (error) {
          // Handle database connection errors
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

        // Social login (Google, Facebook, Apple, etc.)
        if (account && account.type === 'oauth') {
          // User exists
          if (existingUser) {
            const hasProvider = existingUser.accounts.some(
              acc => acc.provider === account.provider
            );

            // Provider already linked - allow sign in
            if (hasProvider) {
              return true;
            }

            // New provider for existing user - link it
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

            // Update email verification if provider is verified
            if (!existingUser.emailVerified) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: { emailVerified: new Date() },
              });
            }

            return true;
          }

          // New user - create account
          await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name ?? '',
              image: user.image,
              emailVerified: new Date() || null,
              onboarded: false,
            },
          });

          return true;
        }

        // Email provider
        if (account && account.type === 'email') {
          // New user
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

        // Credentials provider - handled in authorize
        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        // Handle database connection errors
        if (
          error instanceof Error &&
          error.message.includes("Can't reach database server")
        ) {
          return `/account?error=${encodeURIComponent('Database connection error. Please try again later.')}`;
        }
        // Return error string to be passed in query params
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
              },
            });

            token.onboarding = onboardingData || {
              businessName: null,
              phoneNumber: null,
              registrationType: null,
              workTypes: null,
              startDate: null,
            };
          } catch (error) {
            console.error('Error fetching onboarding data in JWT:', error);
            token.onboarding = {
              businessName: null,
              phoneNumber: null,
              registrationType: null,
              workTypes: null,
              startDate: null,
            };
          }
        }
      }

      // Update token if user data changes
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
        // if (token.image) session.user.image = token.image;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
