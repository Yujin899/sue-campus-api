import { Logger } from '@nestjs/common';

const logger = new Logger('Brevo');

type OtpType =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

interface SendOtpEmailParams {
  to: string;
  otp: string;
  type: OtpType;
}

const SUBJECTS: Record<OtpType, string> = {
  'sign-in': 'Your sign-in code',
  'email-verification': 'Verify your email',
  'forget-password': 'Reset your password',
  'change-email': 'Confirm your new email',
};

function buildHtml({ otp, type }: SendOtpEmailParams): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
      <h2 style="margin:0 0 8px;">${SUBJECTS[type]}</h2>
      <p style="color:#374151;font-size:14px;">Use the code below to continue. It expires in 5 minutes.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;margin:16px 0;">${otp}</p>
      <p style="color:#6b7280;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10_000;

interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

function getBrevoConfig(): BrevoConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    return null;
  }

  return {
    apiKey,
    senderEmail,
    senderName: process.env.BREVO_SENDER_NAME ?? 'Sue Campus',
  };
}

export function isEmailConfigured(): boolean {
  return getBrevoConfig() !== null;
}

export function assertEmailConfigured(): void {
  const missing = [
    !process.env.BREVO_API_KEY ? 'BREVO_API_KEY' : null,
    !process.env.BREVO_SENDER_EMAIL ? 'BREVO_SENDER_EMAIL' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new Error(
      `Brevo is not configured: missing ${missing.join(', ')}. ` +
        'Set these as environment variables before sending OTP emails.',
    );
  }
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
  const config = getBrevoConfig();

  if (!config) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Brevo is not configured, refusing to silently skip the OTP email. ' +
          'Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the environment.',
      );
    }
    logger.log(`[dev] OTP for ${params.to} (${params.type}): ${params.otp}`);
    return;
  }

  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: config.senderEmail,
        name: config.senderName,
      },
      to: [{ email: params.to }],
      subject: SUBJECTS[params.type],
      htmlContent: buildHtml(params),
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Brevo rejected the OTP email (${response.status} ${response.statusText}): ${body}`,
    );
  }

  logger.log(`OTP email (${params.type}) accepted by Brevo for ${params.to}`);
}
