import { z } from 'zod';

export const PaymentMethodSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'MOBILE_MONEY',
  'CHEQUE',
  'OTHER',
]);

export const validRegistrationTypes = [
  'Not yet registered',
  'Business Name',
  'Limited Liability Company (Ltd)',
  'Public Limited Company (PLC)',
  'Limited by Guarantee',
  'Unlimited Company',
  'Limited Liability Partnership (LLP)',
] as const;

export const workTypes = [
  'self-employed',
  'freelancer',
  'employed',
  'business-owner',
] as const;

export const addPaymentSchema = z.object({
  amountPaid: z.number().nonnegative('Amount cannot be negative'),
  paymentMethod: PaymentMethodSchema,
  reference: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.union([z.string(), z.date()]),
});

export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine(val => !val || /^\+?[0-9]{8,15}$/.test(val), {
      message:
        'Phone number must contain only digits (optionally starting with +) and be 8–15 digits long',
    }),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  customerRole: z.enum(['BUYER', 'SUPPLIER']).optional(),
});

export const reportQuerySchema = z.object({
  range: z
    .enum([
      'today',
      'thisWeek',
      'thisMonth',
      'past3Months',
      'past6Months',
      'thisYear',
      'lastYear',
      'all',
      'custom',
    ])
    .default('thisYear'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  openingBalance: z.string().optional(),
});

// lib/validations/general.ts

export const RefundSchema = z
  .object({
    refundAmount: z
      .number({
        message: 'Refund amount must be a number',
      })
      .positive('Refund amount must be greater than 0')
      .min(0.01, 'Refund amount must be at least ₦0.01'),
    refundReason: z
      .string({
        message: 'Refund reason is required',
      })
      .min(3, 'Refund reason must be at least 3 characters')
      .max(500, 'Refund reason must not exceed 500 characters'),
    refundDate: z.union([z.string(), z.date()]).default(() => new Date()),
    paymentMethod: z
      .enum([
        'CASH',
        'BANK_TRANSFER',
        'CARD',
        'MOBILE_MONEY',
        'CHEQUE',
        'OTHER',
      ])
      .optional()
      .default('BANK_TRANSFER'),
    reference: z.string().optional(),
  })
  .transform(data => ({
    ...data,
    refundDate:
      data.refundDate instanceof Date
        ? data.refundDate
        : new Date(data.refundDate),
  }));

export type RefundType = z.infer<typeof RefundSchema>;

// Edit Payment Schema

// ============================================
// ENUMS
// ============================================

export const InvoiceStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'CONVERTED',
  'OVERDUE',
  'CANCELLED',
]);

export const QuotationStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export const SaleSourceTypeSchema = z.enum(['DIRECT', 'FROM_INVOICE']);

export const SaleStatusSchema = z.enum([
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export const PurchaseStatusSchema = z.enum([
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED', // Added
  'PARTIALLY_REFUNDED', // Added
]);

export const PayableTypeSchema = z.enum(['QUOTATION', 'SALE', 'PURCHASE']);

export const PaymentCategorySchema = z.enum(['INCOME', 'EXPENSE']);

export const IncomeMainCategorySchema = z.enum([
  'BUSINESS_PROFIT',
  'EMPLOYMENT_INCOME',
  'TRUST_ESTATE_INCOME',
]);

export const IncomeSubCategorySchema = z.enum([
  // A. Business/Trade Income
  'TRADE_PROFIT',
  'SERVICE_FEES',
  'COMMISSION',
  'ROYALTIES',
  'RENTAL_INCOME',
  'INTEREST_INCOME',
  'DIVIDENDS',
  'CAPITAL_GAINS',
  'DIGITAL_ASSET_GAINS',
  'SECURITIES_GAINS',
  'PRIZES_AWARDS',
  'REBATES_DISCOUNTS',
  'OTHER_BUSINESS_INCOME',

  // B. Employment Income
  'SALARY',
  'BONUS',
  'ALLOWANCES',
  'BENEFITS_IN_KIND',
  'PENSION',
  'SEVERANCE',

  // C. Trust/Estate Income
  'TRUST_DISTRIBUTION',
  'ESTATE_DISTRIBUTION',
]);

export const IncomeSourceTypeSchema = z.enum([
  'SALE_PAYMENT',
  'QUOTATION_PAYMENT',
  'DIRECT_ENTRY',
  'ASSET_DISPOSAL',
  'SECURITY_TRADE',
  'EMPLOYMENT',
  'PASSIVE',
]);

export const ExpenseCategorySchema = z.enum([
  // Cost of Sales
  'COST_OF_GOODS',

  // Operating Expenses
  'RENT_RATES',
  'UTILITIES',
  'SALARIES_WAGES',
  'TRANSPORTATION',
  'FUEL',
  'REPAIRS_MAINTENANCE',

  // Administrative
  'OFFICE_SUPPLIES',
  'SOFTWARE_SUBSCRIPTIONS',
  'PROFESSIONAL_FEES',
  'INSURANCE',
  'LICENSES_PERMITS',

  // Marketing
  'ADVERTISING',
  'MARKETING',

  // Financial
  'BANK_CHARGES',
  'INTEREST_PAID',

  // Other
  'DONATIONS',
  'TRAINING',
  'DEPRECIATION',
  'PERSONAL_EXPENSE',
  'OTHER',
]);

export const ExpenseTaxCategorySchema = z.enum([
  // Deductible (Section 20 of NTA)
  'RENT_AND_PREMISES',
  'EMPLOYEE_COSTS',
  'REPAIRS_MAINTENANCE',
  'INTEREST_ON_DEBT',
  'BAD_DEBTS',
  'RESEARCH_DEVELOPMENT',
  'DONATIONS_DEDUCTIBLE',

  // Non-deductible (Section 21 of NTA)
  'CAPITAL_EXPENDITURE',
  'PERSONAL_EXPENSE',
  'FINES_PENALTIES',
  'NON_APPROVED_PENSION',
  'ENTERTAINMENT',
]);

export const FixedAssetCategorySchema = z.enum([
  'LAND',
  'BUILDING',
  'VEHICLE',
  'MACHINERY',
  'EQUIPMENT',
  'FURNITURE',
  'COMPUTER',
  'OTHER',
]);

export const AssetStatusSchema = z.enum(['ACTIVE', 'DISPOSED', 'WRITTEN_OFF']);

export const DigitalAssetTypeSchema = z.enum([
  'CRYPTOCURRENCY',
  'NFT',
  'DOMAIN_NAME',
  'DIGITAL_ART',
  'GAME_ASSET',
  'OTHER',
]);

export const SecurityTypeSchema = z.enum([
  'STOCK',
  'BOND',
  'MUTUAL_FUND',
  'ETF',
  'TREASURY_BILL',
  'OTHER',
]);

export const WorkTypeSchema = z.enum([
  'self-employed',
  'freelancer',
  'employed',
  'business-owner',
  'digital-trader',
]);

// ============================================
// SHARED SCHEMAS
// ============================================

export const AttachmentSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  type: z.string().optional(),
  size: z.number().optional(),
  uploadedAt: z.date().optional(),
});

export const OtherCostSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
});

export const InvoiceItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  type: z.enum(['PRODUCT', 'SERVICE']),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  costPrice: z.number().positive().optional(),
  profit: z.number().optional(),
  total: z.number().positive('Total must be positive'),
});

export const SaleItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  type: z.enum(['PRODUCT', 'SERVICE']),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  costPrice: z.number().positive().optional(),
  profit: z.number().optional(),
  total: z.number().positive('Total must be positive'),
});

export const PurchaseItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  total: z.number().positive('Total must be positive'),
});

export const RefundedItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  total: z.number().positive('Total must be positive'),
});

export const ValueHistorySchema = z.object({
  date: z.date(),
  previousValue: z.number(),
  newValue: z.number(),
  updatedBy: z.string().optional(),
  reason: z.string().optional(),
});

export const DigitalAssetTransactionSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  qty: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  date: z.date(),
  fee: z.number().nonnegative().optional(),
  profit: z.number().optional(),
  hash: z.string().optional(),
  notes: z.string().optional(),
});

export const SecurityTransactionSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  qty: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  date: z.date(),
  commission: z.number().nonnegative().optional(),
  profit: z.number().optional(),
  notes: z.string().optional(),
});

// ============================================
// QUOTATION SCHEMAS
// ============================================

// export const CreateQuotationSchema = z
//   .object({
//     customerId: z.string().cuid().optional(),
//     customerName: z.string().min(1, 'Customer name is required').optional(),
//     customerEmail: z.string().email().optional(),
//     customerPhone: z.string().optional(),

//     title: z.string().min(1, 'Title is required').optional(),
//     description: z.string().optional(),

//     materials: z.array(MaterialItemSchema).optional(),
//     materialsTotal: z.number().nonnegative().default(0),

//     workmanship: z.array(WorkmanshipItemSchema).optional(),
//     workmanshipTotal: z.number().nonnegative().default(0),

//     otherCosts: z.array(OtherCostSchema).optional(),
//     otherCostsTotal: z.number().nonnegative().default(0),

//     includeVAT: z.boolean().default(false),
//     vatAmount: z.number().nonnegative().optional(),
//     totalAmount: z.number().positive('Total amount must be positive'),

//     validUntil: z.date().optional(),
//     issueDate: z.date().default(() => new Date()),
//   })
//   .refine(
//     data => {
//       const calculated =
//         data.materialsTotal + data.workmanshipTotal + data.otherCostsTotal;
//       const withVAT =
//         data.includeVAT && data.vatAmount
//           ? calculated + data.vatAmount
//           : calculated;
//       return Math.abs(withVAT - data.totalAmount) < 0.01; // Allow small rounding differences
//     },
//     {
//       message:
//         'Total amount must equal materials + workmanship + other costs + VAT',
//     }
//   );

// export const UpdateQuotationSchema = CreateQuotationSchema.partial().extend({
//   status: QuotationStatusSchema.optional(),
// });

// export type CreateQuotationInput = z.infer<typeof CreateQuotationSchema>;
// export type UpdateQuotationInput = z.infer<typeof UpdateQuotationSchema>;

// ============================================
// SALE SCHEMAS
// ============================================

export const CreateSaleSchema = z
  .object({
    sourceType: SaleSourceTypeSchema.default('DIRECT'),
    invoiceId: z.string().cuid().optional(),

    customerId: z.string().cuid().optional(),
    customerName: z.string().min(1, 'Customer name is required').optional(),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().optional(),

    title: z.string().optional(),
    description: z.string().optional(),

    items: z.array(SaleItemSchema).min(1, 'At least one item is required'),

    revenue: z.number().positive('Revenue must be positive'),
    costOfSales: z.number().nonnegative().optional(),
    grossProfit: z.number().optional(),

    includeVAT: z.boolean().default(false),
    vatAmount: z.number().nonnegative().optional(),
    totalAmount: z.number().positive('Total amount must be positive'),

    amountPaid: z.number().nonnegative().default(0),
    balance: z.number().nonnegative(),

    saleDate: z.date().default(() => new Date()),
  })
  .refine(
    data => {
      if (data.costOfSales !== undefined && data.grossProfit !== undefined) {
        return (
          Math.abs(data.grossProfit - (data.revenue - data.costOfSales)) < 0.01
        );
      }

      return true;
    },
    { message: 'Gross profit must equal revenue minus cost of sales' }
  )
  .refine(
    data =>
      Math.abs(data.balance - (data.totalAmount - data.amountPaid)) < 0.01,
    { message: 'Balance must equal total amount minus amount paid' }
  );

export const UpdateSaleSchema = CreateSaleSchema.partial().extend({
  status: SaleStatusSchema.optional(),
});

export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type UpdateSaleInput = z.infer<typeof UpdateSaleSchema>;

// ============================================
// PURCHASE SCHEMAS
// ============================================

export const CreatePurchaseSchema = z
  .object({
    vendorName: z.string().min(1, 'Vendor name is required'),
    vendorEmail: z.string().email().optional(),
    vendorPhone: z.string().optional(),

    title: z.string().optional(),
    description: z.string().optional(),

    items: z.array(PurchaseItemSchema).min(1, 'At least one item is required'),

    otherCosts: z.array(OtherCostSchema).optional(),
    otherCostsTotal: z.number().nonnegative().default(0),

    subtotal: z.number().positive('Subtotal must be positive'),
    includeVAT: z.boolean().default(false),
    vatAmount: z.number().nonnegative().optional(),
    totalAmount: z.number().positive('Total amount must be positive'),

    amountPaid: z.number().nonnegative().default(0),
    balance: z.number().nonnegative(),

    purchaseDate: z.date().default(() => new Date()),
  })
  .refine(
    data => {
      const calculated = data.subtotal + data.otherCostsTotal;
      const withVAT =
        data.includeVAT && data.vatAmount
          ? calculated + data.vatAmount
          : calculated;

      return Math.abs(withVAT - data.totalAmount) < 0.01;
    },
    { message: 'Total amount must equal subtotal + other costs + VAT' }
  )
  .refine(
    data =>
      Math.abs(data.balance - (data.totalAmount - data.amountPaid)) < 0.01,
    { message: 'Balance must equal total amount minus amount paid' }
  );

export const UpdatePurchaseSchema = CreatePurchaseSchema.partial().extend({
  status: PurchaseStatusSchema.optional(),
});

export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof UpdatePurchaseSchema>;

// ============================================
// PAYMENT SCHEMAS
// ============================================

export const CreatePaymentSchema = z.object({
  payableType: PayableTypeSchema,
  payableId: z.string().cuid('Invalid payable ID'),

  amount: z.number().positive('Payment amount must be positive'),
  paymentDate: z.date().default(() => new Date()),
  paymentMethod: PaymentMethodSchema,
  category: PaymentCategorySchema,

  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdatePaymentSchema = CreatePaymentSchema.partial().extend({
  id: z.string().cuid(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;

// ============================================
// INCOME RECORD SCHEMAS
// ============================================

export const CreateIncomeRecordSchema = z
  .object({
    mainCategory: IncomeMainCategorySchema,
    subCategory: IncomeSubCategorySchema,

    grossAmount: z.number().positive('Gross amount must be positive'),
    taxableAmount: z.number().nonnegative('Taxable amount cannot be negative'),

    description: z.string().optional(),
    date: z.date().default(() => new Date()),

    sourceType: IncomeSourceTypeSchema.optional(),
    sourceId: z.string().optional(),
    saleId: z.string().cuid().optional(),

    employer: z.string().optional(),
    assetId: z.string().optional(),

    withholdingTax: z.number().nonnegative().default(0),
    vatAmount: z.number().nonnegative().default(0),

    attachments: z.array(AttachmentSchema).optional(),
  })
  .refine(data => data.taxableAmount <= data.grossAmount, {
    message: 'Taxable amount cannot exceed gross amount',
  });

export const UpdateIncomeRecordSchema = CreateIncomeRecordSchema.partial();

export type CreateIncomeRecordInput = z.infer<typeof CreateIncomeRecordSchema>;
export type UpdateIncomeRecordInput = z.infer<typeof UpdateIncomeRecordSchema>;

// ============================================
// EXPENSE SCHEMAS
// ============================================

export const CreateExpenseSchema = z.object({
  category: ExpenseCategorySchema,
  subCategory: z.string().optional(),

  amount: z.number().positive('Expense amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  date: z.date().default(() => new Date()),

  isDeductible: z.boolean().default(true),
  deductionPercentage: z.number().int().min(0).max(100).default(100),
  taxCategory: ExpenseTaxCategorySchema.optional(),

  purchaseId: z.string().cuid().optional(),

  receipt: z.string().url().optional(),
  attachments: z.array(AttachmentSchema).optional(),

  vendor: z.string().optional(),
  reference: z.string().optional(),
});

export const UpdateExpenseSchema = CreateExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;

// ============================================
// FIXED ASSET SCHEMAS
// ============================================

export const CreateFixedAssetSchema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  category: FixedAssetCategorySchema,

  acquisitionCost: z.number().positive('Acquisition cost must be positive'),
  acquisitionDate: z.date(),
  currentValue: z.number().nonnegative('Current value cannot be negative'),
  depreciationRate: z.number().min(0).max(100).optional(),
  residualValue: z.number().nonnegative().default(0),

  description: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const UpdateFixedAssetSchema = z.object({
  name: z.string().min(1).optional(),
  category: FixedAssetCategorySchema.optional(),

  currentValue: z.number().nonnegative().optional(),
  depreciationRate: z.number().min(0).max(100).optional(),
  residualValue: z.number().nonnegative().optional(),

  // For disposal
  disposalDate: z.date().optional(),
  disposalProceeds: z.number().nonnegative().optional(),

  description: z.string().optional(),
  status: AssetStatusSchema.optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const DisposeFixedAssetSchema = z.object({
  disposalDate: z.date().default(() => new Date()),
  disposalProceeds: z
    .number()
    .nonnegative('Disposal proceeds cannot be negative'),
  reason: z.string().optional(),
});

export type CreateFixedAssetInput = z.infer<typeof CreateFixedAssetSchema>;
export type UpdateFixedAssetInput = z.infer<typeof UpdateFixedAssetSchema>;
export type DisposeFixedAssetInput = z.infer<typeof DisposeFixedAssetSchema>;

// ============================================
// DIGITAL ASSET SCHEMAS
// ============================================

export const CreateDigitalAssetSchema = z.object({
  type: DigitalAssetTypeSchema,
  name: z.string().min(1, 'Asset name is required'),
  symbol: z.string().optional(),

  quantity: z.number().positive('Quantity must be positive'),
  averageCost: z.number().nonnegative('Average cost cannot be negative'),
  currentValue: z.number().nonnegative('Current value cannot be negative'),

  description: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const UpdateDigitalAssetSchema = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().optional(),

  quantity: z.number().positive().optional(),
  currentValue: z.number().nonnegative().optional(),

  description: z.string().optional(),
  status: AssetStatusSchema.optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const AddDigitalAssetTransactionSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  qty: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  date: z.date().default(() => new Date()),
  fee: z.number().nonnegative().optional(),
  hash: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateDigitalAssetInput = z.infer<typeof CreateDigitalAssetSchema>;
export type UpdateDigitalAssetInput = z.infer<typeof UpdateDigitalAssetSchema>;
export type AddDigitalAssetTransactionInput = z.infer<
  typeof AddDigitalAssetTransactionSchema
>;

// ============================================
// SECURITY SCHEMAS
// ============================================

export const CreateSecuritySchema = z.object({
  type: SecurityTypeSchema,
  symbol: z.string().min(1, 'Symbol is required'),
  name: z.string().min(1, 'Name is required'),
  exchange: z.string().optional(),

  quantity: z.number().positive('Quantity must be positive'),
  averageCost: z.number().nonnegative('Average cost cannot be negative'),
  currentValue: z.number().nonnegative('Current value cannot be negative'),

  description: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const UpdateSecuritySchema = z.object({
  name: z.string().min(1).optional(),
  exchange: z.string().optional(),

  quantity: z.number().positive().optional(),
  currentValue: z.number().nonnegative().optional(),

  description: z.string().optional(),
  status: AssetStatusSchema.optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const AddSecurityTransactionSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  qty: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  date: z.date().default(() => new Date()),
  commission: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const RecordDividendSchema = z.object({
  amount: z.number().positive('Dividend amount must be positive'),
  date: z.date().default(() => new Date()),
  notes: z.string().optional(),
});

export type CreateSecurityInput = z.infer<typeof CreateSecuritySchema>;
export type UpdateSecurityInput = z.infer<typeof UpdateSecuritySchema>;
export type AddSecurityTransactionInput = z.infer<
  typeof AddSecurityTransactionSchema
>;
export type RecordDividendInput = z.infer<typeof RecordDividendSchema>;

// ============================================
// CATEGORY & SUBCATEGORY HELPERS
// ============================================

export const INCOME_CATEGORIES = {
  BUSINESS_PROFIT: {
    label: 'Business/Trade Income',
    description: 'Profit or gain of company/person',
    subcategories: {
      TRADE_PROFIT: 'Net profit from product sales',
      SERVICE_FEES: 'Professional fees, consultation, workmanship',
      COMMISSION: 'Sales commission, referral fees',
      ROYALTIES: 'IP licensing, book royalties',
      RENTAL_INCOME: 'Property rental income',
      INTEREST_INCOME: 'Lending, bank interest',
      DIVIDENDS: 'Share dividends',
      CAPITAL_GAINS: 'Sale of fixed assets',
      DIGITAL_ASSET_GAINS: 'Cryptocurrency, NFT gains',
      SECURITIES_GAINS: 'Stock market gains',
      PRIZES_AWARDS: 'Competition winnings, grants, honoraria',
      REBATES_DISCOUNTS: 'Supplier rebates received',
      OTHER_BUSINESS_INCOME: 'Other business income',
    },
  },
  EMPLOYMENT_INCOME: {
    label: 'Employment Income',
    description: 'Salaries, wages, benefits',
    subcategories: {
      SALARY: 'Regular salary/wages',
      BONUS: 'Performance bonus',
      ALLOWANCES: 'Housing, transport allowances',
      BENEFITS_IN_KIND: 'Company car, housing benefit',
      PENSION: 'Retirement income',
      SEVERANCE: 'Termination benefits',
    },
  },
  TRUST_ESTATE_INCOME: {
    label: 'Trust/Estate Income',
    description: 'Income from trusts or estates',
    subcategories: {
      TRUST_DISTRIBUTION: 'Distribution from trust',
      ESTATE_DISTRIBUTION: 'Distribution from estate',
    },
  },
} as const;

export const EXPENSE_CATEGORIES = {
  COST_OF_GOODS: {
    label: 'Cost of Goods Sold',
    description: 'Inventory/raw materials purchases',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  RENT_RATES: {
    label: 'Rent & Rates',
    description: 'Office/shop rent, property rates',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  UTILITIES: {
    label: 'Utilities',
    description: 'Electricity, water, internet',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  SALARIES_WAGES: {
    label: 'Salaries & Wages',
    description: 'Employee salaries and wages',
    deductible: true,
    taxCategory: 'EMPLOYEE_COSTS',
  },
  TRANSPORTATION: {
    label: 'Transportation',
    description: 'Business transport, fuel',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  FUEL: {
    label: 'Fuel',
    description: 'Vehicle fuel costs',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  REPAIRS_MAINTENANCE: {
    label: 'Repairs & Maintenance',
    description: 'Equipment repairs and maintenance',
    deductible: true,
    taxCategory: 'REPAIRS_MAINTENANCE',
  },
  OFFICE_SUPPLIES: {
    label: 'Office Supplies',
    description: 'Stationery, printing materials',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  SOFTWARE_SUBSCRIPTIONS: {
    label: 'Software Subscriptions',
    description: 'Business software and tools',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  PROFESSIONAL_FEES: {
    label: 'Professional Fees',
    description: 'Accountant, lawyer fees',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  INSURANCE: {
    label: 'Insurance',
    description: 'Business insurance premiums',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  LICENSES_PERMITS: {
    label: 'Licenses & Permits',
    description: 'Business licenses and permits',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  ADVERTISING: {
    label: 'Advertising',
    description: 'Advertisements and promotions',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  MARKETING: {
    label: 'Marketing',
    description: 'Marketing materials and campaigns',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  BANK_CHARGES: {
    label: 'Bank Charges',
    description: 'Bank fees and charges',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  INTEREST_PAID: {
    label: 'Interest Paid',
    description: 'Loan interest payments',
    deductible: true,
    taxCategory: 'INTEREST_ON_DEBT',
  },
  DONATIONS: {
    label: 'Donations',
    description: 'Charitable donations',
    deductible: true,
    taxCategory: 'DONATIONS_DEDUCTIBLE',
  },
  TRAINING: {
    label: 'Training',
    description: 'Professional development and training',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
  DEPRECIATION: {
    label: 'Depreciation',
    description: 'Asset depreciation',
    deductible: true,
    taxCategory: 'CAPITAL_EXPENDITURE',
  },
  PERSONAL_EXPENSE: {
    label: 'Personal Expense',
    description: 'Non-deductible personal expenses',
    deductible: false,
    taxCategory: 'PERSONAL_EXPENSE',
  },
  OTHER: {
    label: 'Other',
    description: 'Other expenses',
    deductible: true,
    taxCategory: 'RENT_AND_PREMISES',
  },
} as const;

export const PAYMENT_METHODS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card Payment',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
} as const;

export const FIXED_ASSET_CATEGORIES = {
  LAND: 'Land',
  BUILDING: 'Building',
  VEHICLE: 'Vehicle',
  MACHINERY: 'Machinery',
  EQUIPMENT: 'Equipment',
  FURNITURE: 'Furniture & Fixtures',
  COMPUTER: 'Computer & Electronics',
  OTHER: 'Other',
} as const;

export const DIGITAL_ASSET_TYPES = {
  CRYPTOCURRENCY: 'Cryptocurrency',
  NFT: 'NFT (Non-Fungible Token)',
  DOMAIN_NAME: 'Domain Name',
  DIGITAL_ART: 'Digital Art',
  GAME_ASSET: 'Game Asset',
  OTHER: 'Other Digital Asset',
} as const;

export const SECURITY_TYPES = {
  STOCK: 'Stock/Shares',
  BOND: 'Bond',
  MUTUAL_FUND: 'Mutual Fund',
  ETF: 'Exchange-Traded Fund (ETF)',
  TREASURY_BILL: 'Treasury Bill',
  OTHER: 'Other Security',
} as const;
