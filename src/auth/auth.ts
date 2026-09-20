import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { sendOtpEmail } from '../email/brevo';
import { createPrismaClient } from '../prisma/prisma-client';

const prisma = createPrismaClient();

const trustedOrigins = [
  ...(process.env.VERCEL ? ['https://*.vercel.app'] : []),
  process.env.FRONTEND_ORIGIN,
  process.env.BETTER_AUTH_URL,
].filter((origin): origin is string => Boolean(origin));

const hasGoogleCredentials =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET);

const cookieSameSite = process.env.COOKIE_SAME_SITE === 'none' ? 'none' : 'lax';

export const auth = betterAuth({
  url: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  basePath: '/api/auth',
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    ...(hasGoogleCredentials
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: 'USER',
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookies: {
      session_token: {
        attributes: { sameSite: cookieSameSite },
      },
    },
  },
  plugins: [
    emailOTP({
      expiresIn: 300,
      otpLength: 6,
      rateLimit: {
        window: 60,
        max: 3,
      },
      // eslint-disable-next-line @typescript-eslint/require-await -- intentionally fire-and-forget (avoid OTP timing attacks)
      async sendVerificationOTP({ email, otp, type }) {
        void sendOtpEmail({ to: email, otp, type });
      },
    }),
  ],
});
