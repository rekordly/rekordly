// lib/email/send-waitlist.ts
import nodemailer from 'nodemailer';

interface WaitlistEmailParams {
  name: string;
  email: string;
}

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

export async function sendWaitlistEmail({ name, email }: WaitlistEmailParams) {
  const transporter = getEmailTransporter();

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Rekordly" <rekordlly@gmail.com>',
      to: email,
      subject: 'Welcome to the Rekordly Waitlist! 🎉',
      html: generateWaitlistEmailHTML(name),
      text: generateWaitlistEmailText(name),
    });

    console.log('📧 Waitlist email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Failed to send waitlist email:', error);
    throw new Error('Failed to send waitlist confirmation email');
  }
}

function generateWaitlistEmailHTML(name: string): string {
  const firstName = name.split(' ')[0];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Figtree:wght@400;500&display=swap" rel="stylesheet">
      <title>Welcome to Rekordly Waitlist</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
              
              <!-- Header with Logo -->
              <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center;">
                  
                  <h1 style="
                    font-family: 'Sora', Arial, sans-serif;
                    font-size: 28px;
                    font-weight: 700;
                    color: #0b0b0b;
                    margin: 0;
                  ">
                    You're on the List 🎉
                  </h1>

                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 20px 40px 40px 40px;">
                  <p style="font-family: 'Figtree', Arial, sans-serif; font-size: 16px; line-height: 24px; color: #555;">
                    Hi ${firstName},
                  </p>

                  <p style="
                    font-family: 'Figtree', Arial, sans-serif;
                    font-size: 16px;
                    line-height: 24px;
                    color: #555;
                  ">
                    Thanks for joining the <strong style="color:#009e10;">Rekordly</strong> waitlist.
                    We’re building a simpler way to manage your business records — without Excel,
                    notebooks, or complicated software.
                  </p>

                  
                  <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #666666;">
                    We're working hard to build something special, and you'll be among the first to know when we launch.
                  </p>
                  
                  <!-- Benefits Box -->
                  <div style="background: linear-gradient(135deg, #CEEFD1 0%, #E6F7E8 100%); padding: 24px; border-radius: 12px; border-left: 4px solid #009e10; margin: 24px 0;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">
                      What's Next?
                    </h3>
                    <ul style="margin: 0; padding-left: 10px; color: #666666; font-size: 14px; line-height: 22px;">
                      <li style="margin-bottom: 8px;">✨ <strong>Early Access</strong> - Be the first to try Rekordly</li>
                      <li style="margin-bottom: 8px;">🎁 <strong>Exclusive Features</strong> - Access to premium features</li>
                      <li style="margin-bottom: 8px;">💰 <strong>Special Pricing</strong> - Founders' discount on launch</li>
                      <li>📬 <strong>Updates</strong> - Regular progress updates and sneak peeks</li>
                    </ul>
                  </div>
                  
                  <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 20px; color: #999999;">
                    In the meantime, follow us on social media to stay updated with our journey!
                  </p>
                  
                  <!-- Social Links -->
                  <!-- Social Links using SimpleIcons CDN -->
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
  <tr>
    <td style="padding: 0 8px;">
      <a href="https://facebook.com/rekordly">
        <img src="https://www.rekordly.com/social/facebook.png" width="32" height="32" alt="Facebook" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://instagram.com/rekordly">
        <img src="https://www.rekordly.com/social/instagram.png" width="32" height="32" alt="Instagram" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://tiktok.com/@rekordly">
        <img src="https://www.rekordly.com/social/tiktok.png" width="32" height="32" alt="TikTok" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://x.com/rekordly">
        <img src="https://www.rekordly.com/social/x.png" width="32" height="32" alt="X" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://youtube.com/@rekordly">
        <img src="https://www.rekordly.com/social/youtube.png" width="32" height="32" alt="YouTube" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://linkedin.com/company/rekordly">
        <img src="https://www.rekordly.com/social/linkedin.png" width="32" height="32" alt="LinkedIn" />
      </a>
    </td>
    <td style="padding: 0 8px;">
      <a href="https://threads.net/@rekordly">
        <img src="https://www.rekordly.com/social/threads.png" width="32" height="32" alt="Threads" />
      </a>
    </td>
  </tr>
</table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 20px; color: #666666; text-align: center;">
                    Questions? Reply to this email - we'd love to hear from you!
                  </p>
                  <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                    © ${new Date().getFullYear()} Rekordly. All rights reserved.
                  </p>
                  <p style="margin: 8px 0 0 0; font-size: 11px; color: #999999; text-align: center;">
                    <a href="#" style="color: #999999; text-decoration: underline;">Unsubscribe</a>
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

function generateWaitlistEmailText(name: string): string {
  const firstName = name.split(' ')[0];

  return `
You're on the List! 🎉

Hi ${firstName},

Thank you for joining the Rekordly waitlist! We're thrilled to have you as part of our early community.

We're working hard to build something special, and you'll be among the first to know when we launch.

WHAT'S NEXT?
✨ Early Access - Be the first to try Rekordly
🎁 Exclusive Features - Access to premium features
💰 Special Pricing - Founders' discount on launch
📬 Updates - Regular progress updates and sneak peeks

Questions? Reply to this email - we'd love to hear from you!

© ${new Date().getFullYear()} Rekordly. All rights reserved.
  `.trim();
}
