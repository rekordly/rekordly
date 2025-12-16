import { z } from 'zod';

import {
  addPaymentSchema,
  customerSchema,
  QuotationStatusSchema,
  InvoiceStatusSchema,
  SaleStatusSchema,
  RefundSchema,
  PaymentMethodSchema,
} from '@/lib/validations/general';
import { PayableType } from '@prisma/client';

export interface SessionUser {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    onboarded: boolean;
    hasPassword: boolean;
    emailVerified: boolean;
  };
}

export interface MenuItem {
  name: string;
  href: string;
}

export type SessionFlowProps = SessionUser;
export type AddPaymentType = z.infer<typeof addPaymentSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type CustomerType = z.infer<typeof customerSchema>;
export type QuotationStatusType = z.infer<typeof QuotationStatusSchema>;
export type InvoiceStatusType = z.infer<typeof InvoiceStatusSchema>;

export type SaleStatusType = z.infer<typeof SaleStatusSchema>;
export type StatusType = z.infer<typeof SaleStatusSchema>;
export type RefundType = z.infer<typeof RefundSchema>;

export interface RefundFormData {
  refundReason: string;
  refundDate?: string;
}

export interface PaymentRecord {
  id: string;
  saleId?: string | null;
  quotationId?: string | null;
  purchaseId?: string | null;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  category: 'INCOME' | 'EXPENSE';
  payableType: PayableType;
  reference?: string | null;
  notes?: string | null;
}

export interface RefundableItem {
  id: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
  refundAmount?: number | null;
  refundReason?: string | null;
  refundDate?: string | Date | null;
  payments?: PaymentRecord[];
}
