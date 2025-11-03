import nodemailer from 'nodemailer';
import { formatCurrency, formatDate } from '@/lib/fn';

interface BusinessInfo {
  name: string;
  email: string;
  phone: string;
}

interface InvoiceEmailData {
  id: string;
  invoiceNumber: string;
  title: string | null;
  description: string | null;
  items: any;
  amount: number;
  vatAmount: number | null;
  totalAmount: number;
  includeVAT: boolean;
  status: string;
  issueDate: Date | string;
  dueDate: Date | string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customer?: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

function generateInvoiceHTML(
  invoice: InvoiceEmailData,
  businessInfo: BusinessInfo
): string {
  const customerName =
    invoice.customerName || invoice.customer?.name || 'Valued Customer';
  const customerEmail =
    invoice.customerEmail || invoice.customer?.email || null;
  const customerPhone =
    invoice.customerPhone || invoice.customer?.phone || null;
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  // Ensure dates are properly formatted
  const issueDate =
    invoice.issueDate instanceof Date
      ? formatDate(invoice.issueDate)
      : formatDate(new Date(invoice.issueDate));

  const dueDate = invoice.dueDate
    ? invoice.dueDate instanceof Date
      ? formatDate(invoice.dueDate)
      : formatDate(new Date(invoice.dueDate))
    : null;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoice.invoiceNumber}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      
      <!-- Email Container -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
        <tr>
          <td align="center">
            
            <!-- Main Content Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 700px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
              
              <!-- Header Section -->
              <tr>
                <td style="padding: 48px 48px 32px 48px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <h1 style="margin: 0 0 4px 0; font-size: 36px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                          INVOICE
                        </h1>
                        <p style="margin: 0; font-size: 16px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">
                          ${invoice.invoiceNumber}
                        </p>
                      </td>
                      <td align="right">
                        <div style="background-color: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2);">
                          <p style="margin: 0 0 4px 0; font-size: 11px; color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            Issue Date
                          </p>
                          <p style="margin: 0; font-size: 15px; color: #ffffff; font-weight: 600;">
                            ${issueDate}
                          </p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Business & Customer Info Section -->
              <tr>
                <td style="padding: 40px 48px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <!-- From Section -->
                      <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                        <p style="margin: 0 0 8px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">
                          From
                        </p>
                        <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #111827; line-height: 1.3;">
                          ${businessInfo.name}
                        </h2>
                        ${
                          businessInfo.email
                            ? `
                          <p style="margin: 0 0 6px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                            <span style="color: #9ca3af;">✉</span> ${businessInfo.email}
                          </p>
                        `
                            : ''
                        }
                        ${
                          businessInfo.phone
                            ? `
                          <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                            <span style="color: #9ca3af;">📞</span> ${businessInfo.phone}
                          </p>
                        `
                            : ''
                        }
                      </td>

                      <!-- To Section -->
                      <td style="width: 50%; vertical-align: top; padding-left: 20px; border-left: 2px solid #f3f4f6;">
                        <p style="margin: 0 0 8px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">
                          Bill To
                        </p>
                        <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #111827; line-height: 1.3;">
                          ${customerName}
                        </h2>
                        ${
                          customerEmail
                            ? `
                          <p style="margin: 0 0 6px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                            <span style="color: #9ca3af;">✉</span> ${customerEmail}
                          </p>
                        `
                            : ''
                        }
                        ${
                          customerPhone
                            ? `
                          <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                            <span style="color: #9ca3af;">📞</span> ${customerPhone}
                          </p>
                        `
                            : ''
                        }
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Due Date Section (if exists) -->
              ${
                dueDate
                  ? `
                <tr>
                  <td style="padding: 0 48px 32px 48px;">
                    <div style="background: linear-gradient(to right, #fef3c7, #fde68a); padding: 16px 20px; border-radius: 10px; border-left: 4px solid #f59e0b;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 600;">
                              ⏰ Payment Due Date
                            </p>
                          </td>
                          <td align="right">
                            <p style="margin: 0; font-size: 15px; color: #78350f; font-weight: 700;">
                              ${dueDate}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              `
                  : ''
              }

              <!-- Invoice Title & Description -->
              ${
                invoice.title || invoice.description
                  ? `
                <tr>
                  <td style="padding: 0 48px 32px 48px;">
                    ${
                      invoice.title
                        ? `
                      <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #111827; line-height: 1.4;">
                        ${invoice.title}
                      </h3>
                    `
                        : ''
                    }
                    ${
                      invoice.description
                        ? `
                      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.7;">
                        ${invoice.description}
                      </p>
                    `
                        : ''
                    }
                  </td>
                </tr>
              `
                  : ''
              }

              <!-- Items Table -->
              <tr>
                <td style="padding: 0 48px 40px 48px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <!-- Table Header -->
                    <tr style="background: linear-gradient(to bottom, #f9fafb, #f3f4f6);">
                      <th style="text-align: left; padding: 16px 20px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #e5e7eb;">
                        Description
                      </th>
                      <th style="text-align: center; padding: 16px 20px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #e5e7eb;">
                        Qty
                      </th>
                      <th style="text-align: right; padding: 16px 20px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #e5e7eb;">
                        Rate
                      </th>
                      <th style="text-align: right; padding: 16px 20px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #e5e7eb;">
                        Amount
                      </th>
                    </tr>
                    
                    <!-- Table Body -->
                    ${items
                      .map(
                        (item: any, index: number) => `
                      <tr style="border-bottom: 1px solid ${index === items.length - 1 ? 'transparent' : '#f3f4f6'};">
                        <td style="padding: 18px 20px; font-size: 14px; color: #111827; font-weight: 500;">
                          ${item.description || 'Item'}
                        </td>
                        <td style="padding: 18px 20px; font-size: 14px; color: #6b7280; text-align: center; font-weight: 500;">
                          ${item.quantity}
                        </td>
                        <td style="padding: 18px 20px; font-size: 14px; color: #6b7280; text-align: right; font-weight: 500;">
                          ${formatCurrency(item.rate || item.price || 0)}
                        </td>
                        <td style="padding: 18px 20px; font-size: 14px; color: #111827; text-align: right; font-weight: 700;">
                          ${formatCurrency(item.amount || item.quantity * (item.rate || item.price || 0))}
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </table>
                </td>
              </tr>

              <!-- Totals Section -->
              <tr>
                <td style="padding: 0 48px 48px 48px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%"></td>
                      <td width="50%">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                          
                          <!-- Subtotal -->
                          <tr>
                            <td style="padding: 8px 0;">
                              <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500;">
                                Subtotal
                              </p>
                            </td>
                            <td align="right" style="padding: 8px 0;">
                              <p style="margin: 0; font-size: 14px; color: #111827; font-weight: 600;">
                                ${formatCurrency(invoice.amount)}
                              </p>
                            </td>
                          </tr>

                          <!-- VAT (if applicable) -->
                          ${
                            invoice.includeVAT && invoice.vatAmount
                              ? `
                            <tr>
                              <td style="padding: 8px 0;">
                                <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500;">
                                  VAT (7.5%)
                                </p>
                              </td>
                              <td align="right" style="padding: 8px 0;">
                                <p style="margin: 0; font-size: 14px; color: #111827; font-weight: 600;">
                                  ${formatCurrency(invoice.vatAmount)}
                                </p>
                              </td>
                            </tr>
                          `
                              : ''
                          }

                          <!-- Divider -->
                          <tr>
                            <td colspan="2" style="padding: 12px 0;">
                              <div style="height: 2px; background: linear-gradient(to right, #e5e7eb, #d1d5db, #e5e7eb);"></div>
                            </td>
                          </tr>

                          <!-- Total -->
                          <tr>
                            <td style="padding: 8px 0;">
                              <p style="margin: 0; font-size: 16px; color: #6366f1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                Total
                              </p>
                            </td>
                            <td align="right" style="padding: 8px 0;">
                              <p style="margin: 0; font-size: 24px; color: #111827; font-weight: 800; letter-spacing: -0.5px;">
                                ${formatCurrency(invoice.totalAmount)}
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 32px 48px; background: linear-gradient(to bottom, #ffffff, #f9fafb); border-top: 1px solid #e5e7eb;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <p style="margin: 0 0 8px 0; font-size: 16px; color: #111827; font-weight: 600;">
                          Thank you for your business! 🙏
                        </p>
                        <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.6;">
                          If you have any questions about this invoice, please contact us at<br/>
                          <a href="mailto:${businessInfo.email}" style="color: #6366f1; text-decoration: none; font-weight: 500;">${businessInfo.email}</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
            
            <!-- Email Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 700px; margin-top: 24px;">
              <tr>
                <td align="center" style="padding: 0 20px;">
                  <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                    This is an automated invoice from ${businessInfo.name}.<br/>
                    Powered by Rekordly
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

export async function sendInvoiceEmail(
  invoice: InvoiceEmailData,
  recipientEmail: string,
  businessInfo: BusinessInfo
) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });

  const htmlContent = generateInvoiceHTML(invoice, businessInfo);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: `Invoice ${invoice.invoiceNumber} from ${businessInfo.name}`,
    html: htmlContent,
  });
}
