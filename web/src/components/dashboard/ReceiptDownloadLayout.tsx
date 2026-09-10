import React from 'react';
import { formatCurrency, formatDate } from '@/lib/fn';

export interface ReceiptDownloadData {
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  number: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  date: string | Date;
  title?: string | null;
  description?: string | null;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  payments?: Array<{
    amount: number;
    paymentDate: string | Date;
    paymentMethod?: string;
    reference?: string | null;
  }>;
}

export function ReceiptDownloadLayout({
  data,
}: {
  data: ReceiptDownloadData;
}) {
  return (
    <div
      style={{
        width: '700px',
        padding: '42px',
        background: '#fff',
        color: '#17202a',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #16a34a', paddingBottom: '22px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '30px', color: '#15803d' }}>
            {data.businessName || 'Rekordly'}
          </h1>
          {data.businessEmail && <div style={{ marginTop: '6px', color: '#64748b' }}>{data.businessEmail}</div>}
          {data.businessPhone && <div style={{ marginTop: '4px', color: '#64748b' }}>{data.businessPhone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '26px', fontWeight: 700 }}>RECEIPT</div>
          <div style={{ marginTop: '8px', color: '#475569' }}>{data.number}</div>
          <div style={{ marginTop: '4px', color: '#475569' }}>{formatDate(data.date)}</div>
        </div>
      </div>

      <div style={{ marginTop: '26px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
        <div style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700 }}>Received from</div>
        <div style={{ marginTop: '7px', fontSize: '18px', fontWeight: 700 }}>{data.customerName || 'Walk-in customer'}</div>
        {data.customerEmail && <div style={{ marginTop: '4px', color: '#64748b' }}>{data.customerEmail}</div>}
        {data.customerPhone && <div style={{ marginTop: '4px', color: '#64748b' }}>{data.customerPhone}</div>}
      </div>

      {(data.title || data.description) && (
        <div style={{ marginTop: '24px' }}>
          {data.title && <div style={{ fontSize: '18px', fontWeight: 700 }}>{data.title}</div>}
          {data.description && <div style={{ marginTop: '6px', color: '#475569' }}>{data.description}</div>}
        </div>
      )}

      <div style={{ marginTop: '26px', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}><span>Total</span><strong>{formatCurrency(data.totalAmount)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}><span>Amount paid</span><strong style={{ color: '#15803d' }}>{formatCurrency(data.amountPaid)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}><span>Amount remaining</span><strong>{formatCurrency(data.balance)}</strong></div>
      </div>

      {(data.payments?.length ?? 0) > 0 && (
        <div style={{ marginTop: '26px' }}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>Payment history</div>
          {data.payments!.map((payment, index) => (
            <div key={`${payment.paymentDate}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
              <span>{formatDate(payment.paymentDate)}{payment.paymentMethod ? ` · ${payment.paymentMethod}` : ''}{payment.reference ? ` · ${payment.reference}` : ''}</span>
              <strong style={{ color: '#17202a' }}>{formatCurrency(payment.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '34px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>Thank you for your business.</div>
    </div>
  );
}
