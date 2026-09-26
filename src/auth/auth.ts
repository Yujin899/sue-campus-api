import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { assertEmailConfigured, sendOtpEmail } from '../email/brevo';
import { createPrismaClient } from '../prisma/prisma-client';

const logger = new Logger('Auth');

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

// Surface a missing Brevo config on boot. Logged rather than thrown so a
// misconfigured email provider cannot take down the rest of the API.
try {
  assertEmailConfigured();
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
}

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
      // Awaited so the serverless function stays alive until Brevo responds.
      // The endpoint returns { success: true } either way, so awaiting leaks
      // nothing about the OTP - only request latency. Errors are logged, never
      // thrown, so a Brevo outage cannot turn into a failed sign-in request.
      async sendVerificationOTP({ email, otp, type }) {
        try {
          await sendOtpEmail({ to: email, otp, type });
        } catch (error) {
          logger.error(
            `Failed to send ${type} OTP email to ${email}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      },
    }),
  ],
});
