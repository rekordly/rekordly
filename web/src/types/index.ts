import { z } from 'zod';

import {
  addPaymentSchema,
  customerSchema,
  QuotationStatusSchema,
  InvoiceStatusSchema,
} from '@/lib/validations/general';

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
export type CustomerType = z.infer<typeof customerSchema>;
export type QuotationStatusType = z.infer<typeof QuotationStatusSchema>;
export type InvoiceStatusType = z.infer<typeof InvoiceStatusSchema>;
