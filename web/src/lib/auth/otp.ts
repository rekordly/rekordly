import crypto from 'crypto';

import nodemailer from 'nodemailer';

import { prisma } from '@/lib/prisma';

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Unified email transporter configuration
const getEmailTransporter = () => {
  if (!process.env.EMAIL_SERVER_HOST || !process.env.EMAIL_SERVER_PORT) {
    throw new Error('Email server configuration is missing');
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT),
    secure: Number(process.env.EMAIL_SERVER_PORT) === 465,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
};

export async function sendOtpCode(
  email: string,
  purpose: string = 'login_recovery'
) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    await prisma.otpCode.deleteMany({
      where: { email, purpose, used: false },
    });

    // Create new OTP code
    await prisma.otpCode.create({
      data: { email, code, purpose, expiresAt },
    });

    // Send email
    await sendOtpEmail(email, code, purpose);

    return { success: true };
  } catch {
    throw new Error('Failed to send verification code. Please try again.');
  }
}

export async function verifyOtpCode(
  email: string,
  code: string,
  purpose: string = 'login_recovery'
) {
  try {
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        email,
        code,
        purpose,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      return { valid: false, error: 'Invalid or expired code' };
    }

    // Mark code as used
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    // If this is for login, mark email as verified
    if (purpose === 'login_recovery') {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (user && !user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Verification failed. Please try again.' };
  }
}

async function sendOtpEmail(email: string, code: string, purpose: string) {
  const transporter = getEmailTransporter();

  const emailTemplates = {
    login_recovery: {
      subject: 'Your Verification Code',
      title: 'Verify Your Email',
      message:
        'You requested to sign in to your account. Use the code below to continue:',
    },
    password_reset: {
      subject: 'Password Reset Code',
      title: 'Reset Your Password',
      message:
        'You requested to reset your password. Use the code below to continue:',
    },
    email_verification: {
      subject: 'Verify Your Email Address',
      title: 'Verify Your Email',
      message: 'Please verify your email address using the code below:',
    },
  };

  const template =
    emailTemplates[purpose as keyof typeof emailTemplates] ||
    emailTemplates.login_recovery;

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Rekordly" <rekordlly@gmail.com>',
      to: email,
      subject: template.subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${template.subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.5px;">
                        ${template.title}
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #666666;">
                        ${template.message}
                      </p>
                      
                      <!-- OTP Code Box -->
                      <table role="presentation" style="width: 100%; margin: 32px 0;">
                        <tr>
                          <td align="center" style="background-color: #f8f9fa; padding: 32px; border-radius: 8px; border: 2px dashed #e1e4e8;">
                            <div style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">
                              ${code}
                            </div>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 20px; color: #999999;">
                        This code will expire in <strong style="color: #666666;">10 minutes</strong>.
                      </p>
                      
                      <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 20px; color: #999999;">
                        If you didn't request this code, please ignore this email or contact support if you have concerns.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                        © ${new Date().getFullYear()} ${process.env.APP_NAME || 'Your App'}. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
${template.title}

${template.message}

Your verification code: ${code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} ${'Rekordly'}
      `.trim(),
    });

    // console.log('📧 Email sent:', info.messageId);
    return info;
  } catch {
    // console.error('❌ Failed to send email:', error);
    throw new Error(
      'Failed to send email. Please check your email configuration.'
    );
  }
}
