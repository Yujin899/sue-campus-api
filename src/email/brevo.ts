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

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        'BREVO_API_KEY is not configured - OTP email could not be sent. Refusing to log the OTP.',
      );
      return;
    }
    logger.log(`[dev] OTP for ${params.to} (${params.type}): ${params.otp}`);
    return;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME ?? 'Sue Campus',
      },
      to: [{ email: params.to }],
      subject: SUBJECTS[params.type],
      htmlContent: buildHtml(params),
    }),
  });

  if (!response.ok) {
    logger.error(
      `Failed to send OTP email via Brevo (${response.status})`,
      await response.text().catch(() => ''),
    );
  }
}
