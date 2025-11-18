import React from 'react';

import { formatCurrency, formatDate, getStatusConfig } from '@/lib/fn';
import { Invoice, InvoiceItemType } from '@/types/invoices';

interface InvoiceDownloadLayoutProps {
  invoice: Invoice;
  businessInfo?: {
    name: string;
    logo?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

/**
 * Clean, print-friendly invoice layout for downloads
 * Uses inline styles to ensure proper rendering in PDF/Image
 */
export const InvoiceDownloadLayout: React.FC<InvoiceDownloadLayoutProps> = ({
  invoice,
  businessInfo,
}) => {
  const statusConfig = getStatusConfig(invoice.status);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const customerName = invoice.customer?.name || invoice.customerName || 'N/A';
  const customerEmail = invoice.customer?.email || invoice.customerEmail;
  const customerPhone = invoice.customer?.phone || invoice.customerPhone;

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: '#ffffff',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#000000',
        padding: '40px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '40px',
          paddingBottom: '24px',
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        <div>
          {businessInfo?.logo ? (
            <img
              alt="Logo"
              src={businessInfo.logo}
              style={{ height: '50px', marginBottom: '12px' }}
            />
          ) : (
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                margin: '0 0 12px 0',
                color: '#6366f1',
              }}
            >
              {businessInfo?.name || 'Rekordly'}
            </h1>
          )}
          {businessInfo?.email && (
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#6b7280' }}>
              {businessInfo.email}
            </p>
          )}
          {businessInfo?.phone && (
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#6b7280' }}>
              {businessInfo.phone}
            </p>
          )}
          {businessInfo?.address && (
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#6b7280' }}>
              {businessInfo.address}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <h2
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              margin: '0 0 8px 0',
              color: '#1f2937',
            }}
          >
            INVOICE
          </h2>
          <p
            style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#6366f1',
              margin: '0',
            }}
          >
            {invoice.invoiceNumber}
          </p>
        </div>
      </div>

      {/* Status and Dates */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        <div>
          <p
            style={{
              fontSize: '12px',
              color: '#6b7280',
              margin: '0 0 4px 0',
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            Status
          </p>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor:
                statusConfig.chipColor === 'success'
                  ? '#d1fae5'
                  : statusConfig.chipColor === 'warning'
                    ? '#fef3c7'
                    : statusConfig.chipColor === 'danger'
                      ? '#fee2e2'
                      : '#e5e7eb',
              color:
                statusConfig.chipColor === 'success'
                  ? '#065f46'
                  : statusConfig.chipColor === 'warning'
                    ? '#92400e'
                    : statusConfig.chipColor === 'danger'
                      ? '#991b1b'
                      : '#1f2937',
            }}
          >
            {invoice.status}
          </span>
        </div>

        <div style={{ textAlign: 'right' }}>
          <p
            style={{
              fontSize: '12px',
              color: '#6b7280',
              margin: '0 0 4px 0',
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            Issue Date
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', margin: '0' }}>
            {formatDate(invoice.issueDate)}
          </p>
        </div>

        {invoice.dueDate && (
          <div style={{ textAlign: 'right' }}>
            <p
              style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: '0 0 4px 0',
                textTransform: 'uppercase',
                fontWeight: '600',
              }}
            >
              Due Date
            </p>
            <p style={{ fontSize: '14px', fontWeight: '600', margin: '0' }}>
              {formatDate(invoice.dueDate)}
            </p>
          </div>
        )}
      </div>

      {/* Customer Info */}
      <div
        style={{
          marginBottom: '32px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
        }}
      >
        <p
          style={{
            fontSize: '12px',
            color: '#6b7280',
            margin: '0 0 12px 0',
            textTransform: 'uppercase',
            fontWeight: '600',
          }}
        >
          Billed To
        </p>
        <p
          style={{
            fontSize: '16px',
            fontWeight: 'bold',
            margin: '0 0 8px 0',
            color: '#1f2937',
          }}
        >
          {customerName}
        </p>
        {customerEmail && (
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>
            📧 {customerEmail}
          </p>
        )}
        {customerPhone && (
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>
            📞 {customerPhone}
          </p>
        )}
      </div>

      {/* Title & Description */}
      {(invoice.title || invoice.description) && (
        <div style={{ marginBottom: '32px' }}>
          {invoice.title && (
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                color: '#1f2937',
              }}
            >
              {invoice.title}
            </h3>
          )}
          {invoice.description && (
            <p
              style={{
                fontSize: '14px',
                color: '#6b7280',
                margin: '0',
                lineHeight: '1.6',
              }}
            >
              {invoice.description}
            </p>
          )}
        </div>
      )}

      {/* Items Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: '24px',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: '#f9fafb',
              borderBottom: '2px solid #e5e7eb',
            }}
          >
            <th
              style={{
                textAlign: 'left',
                padding: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
              }}
            >
              Description
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
              }}
            >
              Rate
            </th>
            <th
              style={{
                textAlign: 'center',
                padding: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
              }}
            >
              Qty
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
              }}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: InvoiceItemType, index: number) => (
            <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td
                style={{ padding: '12px', fontSize: '14px', color: '#1f2937' }}
              >
                {item.description || 'Item'}
              </td>
              <td
                style={{
                  padding: '12px',
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: 'right',
                }}
              >
                {formatCurrency(item.rate || 0)}
              </td>
              <td
                style={{
                  padding: '12px',
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: 'center',
                }}
              >
                {item.quantity}
              </td>
              <td
                style={{
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  textAlign: 'right',
                }}
              >
                {formatCurrency(
                  item.amount || item.quantity * (item.rate || 0)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div
        style={{
          marginLeft: 'auto',
          width: '300px',
          padding: '20px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontSize: '14px', color: '#6b7280' }}>Subtotal</span>
          <span
            style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}
          >
            {formatCurrency(invoice.amount)}
          </span>
        </div>

        {invoice.includeVAT && invoice.vatAmount && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              VAT (7.5%)
            </span>
            <span
              style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}
            >
              {formatCurrency(invoice.vatAmount)}
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '12px',
            marginTop: '12px',
            borderTop: '2px solid #e5e7eb',
          }}
        >
          <span
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#6366f1',
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#1f2937',
            }}
          >
            {formatCurrency(invoice.totalAmount)}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '12px',
            color: '#9ca3af',
            margin: '0',
          }}
        >
          Thank you for your business!
        </p>
      </div>
    </div>
  );
};

export default InvoiceDownloadLayout;
