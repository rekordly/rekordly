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

const brand = {
  green: '#009e10',
  muted: '#64748b',
  ink: '#17202a',
  line: '#dbe4ea',
  soft: '#f6f9fb',
  danger: '#dc2626',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '32px',
  padding: '15px 0',
  borderBottom: `1px solid ${brand.line}`,
  fontSize: '16px',
};

export function ReceiptDownloadLayout({ data }: { data: ReceiptDownloadData }) {
  const remaining = data.balance > 0;

  return (
    <div style={{ width: '640px', boxSizing: 'border-box', margin: '0 auto', padding: '48px 52px 38px', background: '#fff', color: brand.ink, fontFamily: 'Figtree, Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '32px', paddingBottom: '24px', borderBottom: `2px solid ${brand.green}` }}>
        <div>
          <div style={{ fontFamily: 'Sora, Figtree, Arial, sans-serif', fontSize: '28px', lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.03em' }}>Customer receipt</div>
          <div style={{ marginTop: '9px', fontSize: '13px', color: brand.muted, letterSpacing: '0.02em' }}>Payment received · {data.number}</div>
          <div style={{ marginTop: '5px', fontSize: '13px', color: brand.muted }}>{formatDate(data.date)}</div>
        </div>
        <div style={{ minWidth: '150px', textAlign: 'right' }}>
          <img src="/rekordly-logo.svg" alt="Rekordly" style={{ width: '158px', height: 'auto', display: 'inline-block' }} />
          {data.businessEmail && <div style={{ marginTop: '9px', fontSize: '11px', color: brand.muted }}>{data.businessEmail}</div>}
          {data.businessPhone && <div style={{ marginTop: '3px', fontSize: '11px', color: brand.muted }}>{data.businessPhone}</div>}
        </div>
      </div>

      <div style={{ marginTop: '26px', padding: '19px 21px', background: brand.soft, borderRadius: '10px', textAlign: 'center' }}>
        <div style={{ color: brand.muted, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Received from</div>
        <div style={{ marginTop: '8px', fontFamily: 'Sora, Figtree, Arial, sans-serif', fontSize: '22px', fontWeight: 700 }}>{data.customerName || 'Walk-in customer'}</div>
        {(data.customerEmail || data.customerPhone) && <div style={{ marginTop: '8px', fontSize: '13px', color: brand.muted }}>{[data.customerEmail, data.customerPhone].filter(Boolean).join('  ·  ')}</div>}
      </div>

      {(data.title || data.description) && <div style={{ marginTop: '27px', textAlign: 'center' }}>
        {data.title && <div style={{ fontFamily: 'Sora, Figtree, Arial, sans-serif', fontSize: '19px', fontWeight: 700 }}>{data.title}</div>}
        {data.description && <div style={{ marginTop: '7px', fontSize: '14px', color: brand.muted }}>{data.description}</div>}
      </div>}

      <div style={{ marginTop: '28px', borderTop: `1px solid ${brand.line}` }}>
        <div style={rowStyle}><span>Total</span><strong style={{ fontSize: '17px' }}>{formatCurrency(data.totalAmount)}</strong></div>
        <div style={rowStyle}><span>Amount paid</span><strong style={{ color: brand.green, fontSize: '17px' }}>{formatCurrency(data.amountPaid)}</strong></div>
        <div style={{ ...rowStyle, borderBottom: `1px solid ${brand.line}` }}><span>Amount remaining</span><strong style={{ color: remaining ? brand.danger : brand.green, fontSize: '17px' }}>{formatCurrency(data.balance)}</strong></div>
      </div>

      {(data.payments?.length ?? 0) > 0 && <div style={{ marginTop: '28px' }}>
        <div style={{ marginBottom: '8px', fontFamily: 'Sora, Figtree, Arial, sans-serif', fontSize: '16px', fontWeight: 700 }}>Payment history</div>
        {data.payments!.map((payment, index) => <div key={`${payment.paymentDate}-${index}`} style={{ ...rowStyle, padding: '11px 0', fontSize: '13px', color: brand.muted }}>
          <span>{formatDate(payment.paymentDate)}{payment.paymentMethod ? ` · ${payment.paymentMethod}` : ''}{payment.reference ? ` · ${payment.reference}` : ''}</span>
          <strong style={{ color: brand.ink, fontSize: '14px' }}>{formatCurrency(payment.amount)}</strong>
        </div>)}
      </div>}

      <div style={{ marginTop: '31px', textAlign: 'center', color: brand.muted, fontSize: '12px' }}>Thank you for your business.</div>
    </div>
  );
}
