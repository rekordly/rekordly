import { Theme } from 'next-auth';
import nodemailer from 'nodemailer';

export interface SendVerificationRequestParams {
  identifier: string;
  url: string;
  provider: any;
  theme: Theme;
}

export async function sendVerificationRequest(
  params: SendVerificationRequestParams
): Promise<void> {
  const { identifier: email, url, provider } = params;
  const { host } = new URL(url);

  const transporter = nodemailer.createTransport({
    host: provider.server.host,
    port: provider.server.port,
    secure: provider.server.port === 465,
    auth: {
      user: provider.server.auth.user,
      pass: provider.server.auth.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Rekordly" <rekordlly@gmail.com>',
      to: email,
      subject: `Sign in to Rekordly`,
      html: html({ url, host, email }),
      text: text({ url, host }),
    });

    // console.log('✅ Magic link email sent successfully to:', email);
  } catch {
    // console.error('❌ Failed to send magic link email:', error);
    throw new Error('Failed to send verification email');
  }
}

function html(params: { url: string; host: string; email: string }) {
  const { url, host } = params;
  const escapedHost = host.replace(/\./g, '&#8203;.');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign in to Rekordly</title>
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
                    Sign in to Rekordly
                  </h1>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #666666;">
                    Click the button below to sign in to your account:
                  </p>
                  
                  <!-- Button -->
                  <table role="presentation" style="width: 100%; margin: 32px 0;">
                    <tr>
                      <td align="center">
                        <a href="${url}" style="display: inline-block; background-color: #8900FF; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center;">
                          Sign in to ${escapedHost}
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 20px; color: #999999;">
                    This link will expire in <strong style="color: #666666;">10 minutes</strong>.
                  </p>
                  
                  <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 20px; color: #999999;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                  
                  <!-- Alternative link -->
                  <div style="margin: 32px 0 0 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 3px solid #8900FF;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;">
                      Or copy and paste this URL into your browser:
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #8900FF; word-break: break-all; font-family: 'Courier New', monospace;">
                      ${url}
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                    © ${new Date().getFullYear()} ${'Rekordly'}. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function text({ url, host }: { url: string; host: string }) {
  return `
Sign in to ${host}

Click the link below to sign in:
${url}

This link will expire in 10 minutes.

If you didn't request this email, you can safely ignore it.

© ${new Date().getFullYear()} ${process.env.APP_NAME || host}
  `.trim();
}
