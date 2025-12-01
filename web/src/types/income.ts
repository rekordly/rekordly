import { addIncomeSchema } from '@/lib/validations/income';
import z from 'zod';

// @/types/income.ts

export enum IncomeMainCategory {
  BUSINESS_PROFIT = 'BUSINESS_PROFIT',
  EMPLOYMENT_INCOME = 'EMPLOYMENT_INCOME',
  INVESTMENT_INCOME = 'INVESTMENT_INCOME',
  PROPERTY_INCOME = 'PROPERTY_INCOME',
  DIGITAL_ASSETS = 'DIGITAL_ASSETS',
  TRUST_ESTATE_INCOME = 'TRUST_ESTATE_INCOME',
  OTHER_INCOME = 'OTHER_INCOME',
  EXEMPT_INCOME = 'EXEMPT_INCOME', // New category for non-taxable income
}

export enum IncomeSubCategory {
  // A. Business/Trade Income
  TRADE_PROFIT = 'TRADE_PROFIT',
  SERVICE_FEES = 'SERVICE_FEES',
  COMMISSION = 'COMMISSION',
  ROYALTIES = 'ROYALTIES',
  RENTAL_INCOME = 'RENTAL_INCOME',
  INTEREST_INCOME = 'INTEREST_INCOME',
  DIVIDENDS = 'DIVIDENDS',
  PRIZES_AWARDS = 'PRIZES_AWARDS',
  REBATES_DISCOUNTS = 'REBATES_DISCOUNTS',

  OTHER_BUSINESS_INCOME = 'OTHER_BUSINESS_INCOME', // B. Employment Income

  SALARY = 'SALARY',
  BONUS = 'BONUS',
  ALLOWANCES = 'ALLOWANCES',
  BENEFITS_IN_KIND = 'BENEFITS_IN_KIND',
  PENSION = 'PENSION',

  SEVERANCE = 'SEVERANCE', // C. Investment Income

  INVESTMENT_RETURN = 'INVESTMENT_RETURN',
  CAPITAL_GAINS = 'CAPITAL_GAINS',
  STOCK_OPTIONS = 'STOCK_OPTIONS',
  MUTUAL_FUNDS = 'MUTUAL_FUNDS',

  BONDS = 'BONDS', // D. Property Income

  PROPERTY_RENTAL = 'PROPERTY_RENTAL',
  PROPERTY_LEASING = 'PROPERTY_LEASING',

  PROPERTY_DISPOSAL = 'PROPERTY_DISPOSAL', // E. Digital Assets

  CRYPTOCURRENCY_TRADING = 'CRYPTOCURRENCY_TRADING',
  DIGITAL_ASSET_MINING = 'DIGITAL_ASSET_MINING',
  NFT_SALES = 'NFT_SALES',

  DIGITAL_SERVICES = 'DIGITAL_SERVICES', // F. Trust/Estate Income

  TRUST_DISTRIBUTION = 'TRUST_DISTRIBUTION',

  ESTATE_DISTRIBUTION = 'ESTATE_DISTRIBUTION', // G. Other Income

  GIFTS_RECEIVED = 'GIFTS_RECEIVED',
  DONATIONS_RECEIVED = 'DONATIONS_RECEIVED',
  GRANTS = 'GRANTS',
  COMPENSATION = 'COMPENSATION',
  INSURANCE_PROCEEDS = 'INSURANCE_PROCEEDS',
  INHERITANCE = 'INHERITANCE',
  LOAN_FORGIVENESS = 'LOAN_FORGIVENESS',

  CUSTOM = 'CUSTOM', // H. Exempt Income

  RETURN_OF_CAPITAL = 'RETURN_OF_CAPITAL',
  LOAN_RECEIVED = 'LOAN_RECEIVED',
  SPECIFIC_EXEMPTIONS = 'SPECIFIC_EXEMPTIONS',
}

// ============================================================================
// TYPES
// ============================================================================

export type AddIncomeType = z.infer<typeof addIncomeSchema>;

export interface IncomeRecord extends AddIncomeType {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// UI CONFIGURATION
// ============================================================================

export const incomeCategories = [
  {
    value: IncomeMainCategory.BUSINESS_PROFIT,
    label: 'Business/Trade Income',
    subcategories: [
      { value: IncomeSubCategory.TRADE_PROFIT, label: 'Trade Profit' },
      { value: IncomeSubCategory.SERVICE_FEES, label: 'Service Fees' },
      { value: IncomeSubCategory.COMMISSION, label: 'Commission' },
      { value: IncomeSubCategory.ROYALTIES, label: 'Royalties' },
      { value: IncomeSubCategory.RENTAL_INCOME, label: 'Rental Income' },
      { value: IncomeSubCategory.INTEREST_INCOME, label: 'Interest Income' },
      { value: IncomeSubCategory.DIVIDENDS, label: 'Dividends' },
      { value: IncomeSubCategory.PRIZES_AWARDS, label: 'Prizes & Awards' },
      {
        value: IncomeSubCategory.REBATES_DISCOUNTS,
        label: 'Rebates & Discounts',
      },
      {
        value: IncomeSubCategory.OTHER_BUSINESS_INCOME,
        label: 'Other Business Income',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner'],
    description: 'Income from business operations and trade activities',
    note: 'Fully taxable as business income under Section 4(1)(a) of the Tax Act',
  },
  {
    value: IncomeMainCategory.EMPLOYMENT_INCOME,
    label: 'Employment Income',
    subcategories: [
      { value: IncomeSubCategory.SALARY, label: 'Salary' },
      { value: IncomeSubCategory.BONUS, label: 'Bonus' },
      { value: IncomeSubCategory.ALLOWANCES, label: 'Allowances' },
      { value: IncomeSubCategory.BENEFITS_IN_KIND, label: 'Benefits in Kind' },
      { value: IncomeSubCategory.PENSION, label: 'Pension' },
      { value: IncomeSubCategory.SEVERANCE, label: 'Severance' },
    ],
    taxablePercentage: 100,
    workTypes: ['employed'],
    description: 'Income received from employment',
    note: 'Fully taxable as employment income under Section 4(2) of the Tax Act',
  },
  {
    value: IncomeMainCategory.INVESTMENT_INCOME,
    label: 'Investment Income',
    subcategories: [
      {
        value: IncomeSubCategory.INVESTMENT_RETURN,
        label: 'Investment Return',
      },
      { value: IncomeSubCategory.CAPITAL_GAINS, label: 'Capital Gains' },
      { value: IncomeSubCategory.STOCK_OPTIONS, label: 'Stock Options' },
      { value: IncomeSubCategory.MUTUAL_FUNDS, label: 'Mutual Funds' },
      { value: IncomeSubCategory.BONDS, label: 'Bonds' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from investments and financial instruments',
    note: 'Fully taxable as investment income under Section 4(1)(c) and (6) of the Tax Act',
  },
  {
    value: IncomeMainCategory.PROPERTY_INCOME,
    label: 'Property Income',
    subcategories: [
      { value: IncomeSubCategory.PROPERTY_RENTAL, label: 'Property Rental' },
      { value: IncomeSubCategory.PROPERTY_LEASING, label: 'Property Leasing' },
      {
        value: IncomeSubCategory.PROPERTY_DISPOSAL,
        label: 'Property Disposal',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from property ownership and transactions',
    note: 'Fully taxable as property income under Section 4(1)(b) and (i) of the Tax Act',
  },
  {
    value: IncomeMainCategory.DIGITAL_ASSETS,
    label: 'Digital Assets',
    subcategories: [
      {
        value: IncomeSubCategory.CRYPTOCURRENCY_TRADING,
        label: 'Cryptocurrency Trading',
      },
      {
        value: IncomeSubCategory.DIGITAL_ASSET_MINING,
        label: 'Digital Asset Mining',
      },
      { value: IncomeSubCategory.NFT_SALES, label: 'NFT Sales' },
      { value: IncomeSubCategory.DIGITAL_SERVICES, label: 'Digital Services' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from digital assets and virtual transactions',
    note: 'Fully taxable as digital asset income under Section 4(1)(k) of the Tax Act',
  },
  {
    value: IncomeMainCategory.TRUST_ESTATE_INCOME,
    label: 'Trust/Estate Income',
    subcategories: [
      {
        value: IncomeSubCategory.TRUST_DISTRIBUTION,
        label: 'Trust Distribution',
      },
      {
        value: IncomeSubCategory.ESTATE_DISTRIBUTION,
        label: 'Estate Distribution',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from trusts and estates',
    note: 'Fully taxable as trust/estate income under Section 4(4) of the Tax Act',
  },
  {
    value: IncomeMainCategory.OTHER_INCOME,
    label: 'Other Income',
    subcategories: [
      { value: IncomeSubCategory.GIFTS_RECEIVED, label: 'Gifts Received' },
      {
        value: IncomeSubCategory.DONATIONS_RECEIVED,
        label: 'Donations Received',
      },
      { value: IncomeSubCategory.GRANTS, label: 'Grants' },
      { value: IncomeSubCategory.COMPENSATION, label: 'Compensation' },
      {
        value: IncomeSubCategory.INSURANCE_PROCEEDS,
        label: 'Insurance Proceeds',
      },
      { value: IncomeSubCategory.INHERITANCE, label: 'Inheritance' },
      { value: IncomeSubCategory.LOAN_FORGIVENESS, label: 'Loan Forgiveness' },
      { value: IncomeSubCategory.CUSTOM, label: 'Custom' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Other types of income not classified elsewhere',
    note: 'The Act does not provide a general exemption for gifts, donations, or inheritance. They are considered taxable under the broad "Other Income" clause in Section 4(5).',
  },
  {
    value: IncomeMainCategory.EXEMPT_INCOME,
    label: 'Exempt / Non-Taxable Income',
    subcategories: [
      {
        value: IncomeSubCategory.RETURN_OF_CAPITAL,
        label: 'Return of Capital',
      },
      { value: IncomeSubCategory.LOAN_RECEIVED, label: 'Loan Received' },
      {
        value: IncomeSubCategory.SPECIFIC_EXEMPTIONS,
        label: 'Specific Statutory Exemptions',
      },
    ],
    taxablePercentage: 0,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income that is specifically exempt from taxation',
    note: 'Non-taxable by definition. Return of capital is not income. A loan is a liability. Specific exemptions are granted by other parts of the Tax Act (e.g., for Free Trade Zones).',
  },
];

export function formatIncomeSubCategory(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeIncomeSubCategory(
  value: string
): IncomeSubCategory | null {
  const normalizedValue = value.toUpperCase().replace(/\s+/g, '_');

  if (
    Object.values(IncomeSubCategory).includes(
      normalizedValue as IncomeSubCategory
    )
  ) {
    return normalizedValue as IncomeSubCategory;
  }
  return null;
}

export function formatCustomSubCategory(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

// Helper function to get work types for a subcategory
export function getWorkTypesForSubCategory(
  mainCategory: IncomeMainCategory,
  subCategory: IncomeSubCategory
): string[] {
  const category = incomeCategories.find(cat => cat.value === mainCategory);
  if (!category) return [];

  return category.workTypes;
}

// Helper function to get details for a subcategory
export function getSubCategoryDetails(
  mainCategory: IncomeMainCategory,
  subCategory: IncomeSubCategory
) {
  const category = incomeCategories.find(cat => cat.value === mainCategory);
  if (!category) return null;

  return {
    taxablePercentage: category.taxablePercentage,
    workTypes: category.workTypes,
    description: category.description,
    note: category.note,
  };
}
