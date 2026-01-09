import { InventoryType } from '@prisma/client';
import {
  Receipt,
  Shield,
  FileText,
  ChartBar,
  Lock,
  DeviceMobile,
  XCircle,
  CheckCircle,
} from '@phosphor-icons/react';

export const features = [
  {
    icon: Receipt,
    title: 'Double-Entry Bookkeeping',
    description:
      'Professional accounting system with automatic debit/credit recording and balanced ledgers.',
  },
  {
    icon: ChartBar,
    title: 'Financial Statements',
    description:
      'Generate Trial Balance, Profit & Loss, and Balance Sheet reports with one click.',
  },
  {
    icon: FileText,
    title: 'Invoice & Receipt Generation',
    description:
      'Create professional invoices and receipts for sales and purchases with Nigerian tax compliance.',
  },
  {
    icon: Shield,
    title: 'Tax Compliance Ready',
    description:
      "Stay ahead of Nigeria's digital tax requirements with FIRS-aligned reports and calculations.",
  },
  {
    icon: Lock,
    title: 'Bank-Level Security',
    description:
      'Your financial data is encrypted and protected with enterprise-grade security standards.',
  },
  {
    icon: DeviceMobile,
    title: 'Mobile-First Design',
    description:
      'Access your accounts anywhere, anytime with our intuitive mobile app for iOS and Android.',
  },
];

export const list = [
  {
    id: 1,
    title: 'Set up your account',
    img: '/images/fruit-1.jpeg',
    description:
      'Sign up in seconds and select your account type - business, self-employed, employed, or freelancer.',
  },
  {
    id: 2,
    title: 'Record Transactions',
    img: '/images/fruit-2.jpeg',
    description:
      'Add income, sales, expenses, and purchases. Our system automatically handles double-entry recording.',
  },
  {
    id: 3,
    title: 'Generate Reports',
    img: '/images/fruit-3.jpeg',
    description:
      'Create ledgers, trial balances, and tax-ready reports whenever you need them.',
  },
];

export const overview = [
  {
    id: 1,
    title: 'General Ledger',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
    className: 'md:col-span-6',
    description:
      'Complete double-entry bookkeeping system with automatic debit/credit recording.',
  },
  {
    id: 2,
    title: 'Trial Balance',
    img: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
    className: 'md:col-span-4',
    description:
      'Automatically generate balanced trial balances with a single click.',
  },
  {
    id: 3,
    title: 'Debtors & Creditors',
    img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    className: 'md:col-span-4',
    description: 'Track receivables and payables with automated aging reports.',
  },
  {
    id: 4,
    title: 'Profit & Loss',
    img: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800',
    className: 'md:col-span-4',
    description: 'Generate comprehensive P&L statements for any period.',
  },
  {
    id: 5,
    title: 'Trusted by 3k+ Businesses',
    className: 'md:col-span-4',
    description:
      'Join thousands of Nigerian businesses using our platform for accounting.',
    isSpecial: true,
    specialDescription: 'Community Stats',
    bgGradient: 'bg-gradient-to-br from-primary-500/10 to-primary-600/5',
  },
  {
    id: 6,
    title: 'FIRS-Ready Reports',
    className: 'md:col-span-4',
    description: 'Generate tax-compliant reports for Nigerian tax authorities.',
    isSpecial: true,
    specialDescription: 'Tax Compliance',
    bgGradient: 'bg-gradient-to-br from-primary-500/15 to-primary-600/10',
  },
];

export const testimonials = [
  {
    quote:
      'Rekordly transformed how I manage my business accounts. The double-entry system is professional yet simple.',
    name: 'Chinedu O.',
    role: 'Retail Business Owner',
    avatar: 'https://i.pravatar.cc/150?img=1',
  },
  {
    quote:
      'As a freelancer, tracking income and expenses was chaotic. Now everything is organized with proper accounting.',
    name: 'Amina S.',
    role: 'Freelance Consultant',
    avatar: 'https://i.pravatar.cc/150?img=5',
  },
  {
    quote:
      'The financial statements and tax compliance features alone are worth the subscription. Highly recommended!',
    name: 'Emeka N.',
    role: 'SME Owner',
    avatar: 'https://i.pravatar.cc/150?img=9',
  },
  {
    quote:
      "It's the only accounting tool I use daily - and it makes bookkeeping feel simple.",
    name: 'Funke A.',
    role: 'Self-Employed Professional',
    avatar: 'https://i.pravatar.cc/150?img=12',
  },
  {
    quote:
      'No more spreadsheet chaos. Just clean, professional accounting records.',
    name: 'Tunde B.',
    role: 'Startup Founder',
    avatar: 'https://i.pravatar.cc/150?img=15',
  },
  {
    quote:
      'The trial balance and P&L statements saved me hours of work during tax season.',
    name: 'Grace O.',
    role: 'Small Business Owner',
    avatar: 'https://i.pravatar.cc/150?img=20',
  },
  {
    quote:
      "Finally, an accounting app that doesn't require a degree to understand.",
    name: 'David R.',
    role: 'Creative Director',
    avatar: 'https://i.pravatar.cc/150?img=25',
  },
  {
    quote:
      'Rekordly helped me organize my finances and saved me money on accounting fees.',
    name: 'Bisi A.',
    role: 'Content Writer',
    avatar: 'https://i.pravatar.cc/150?img=30',
  },
];

export const comparisonData = [
  {
    title: 'Traditional Accounting',
    accent: 'danger',
    icon: XCircle,
    items: [
      'Complex software, steep learning curve',
      'Expensive licenses and hidden fees',
      'Manual data entry and calculations',
      'No mobile access or cloud sync',
      'Generic support, slow responses',
    ],
  },
  {
    title: 'Rekordly',
    accent: 'success',
    icon: CheckCircle,
    highlight: true,
    items: [
      'Intuitive interface, professional features',
      'Simple, transparent pricing',
      'Automated double-entry bookkeeping',
      'Mobile-first with cloud synchronization',
      'Priority support, fast response',
    ],
  },
];

export const pricingPlans = [
  {
    name: 'Starter Plan',
    price: '₦0',
    period: '/month',
    description: 'Perfect for individuals and freelancers',
    features: [
      'Up to 50 transactions/month',
      'Basic financial reports',
      'Invoice & receipt generation',
      'Mobile app access',
      'Email support',
    ],
    highlighted: false,
  },
  {
    name: 'Growth Plan',
    price: '₦4,900',
    period: '/month',
    description: 'Best for growing businesses',
    features: [
      'Unlimited transactions',
      'Advanced accounting reports',
      'Custom chart of accounts',
      'Priority support',
      'Team collaboration (up to 3)',
      'Export to Excel & PDF',
      'Tax estimation tools',
    ],
    highlighted: true,
  },
  {
    name: 'Enterprise Plan',
    price: '₦12,900',
    period: '/month',
    description: 'For established businesses',
    features: [
      'Everything in Growth Plan',
      'Unlimited team members',
      'Advanced analytics & reporting',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'White-label options',
    ],
    highlighted: false,
  },
];

export const testimonial = [
  {
    name: 'Chinedu O.',
    role: 'Retail Business Owner',
    content:
      'Rekordly transformed how I manage my business accounts. Tax season is no longer stressful!',
    rating: 5,
  },
  {
    name: 'Amina S.',
    role: 'Freelance Consultant',
    content:
      'As a freelancer, tracking income and expenses was chaotic. Now everything is organized in one place.',
    rating: 5,
  },
  {
    name: 'Emeka N.',
    role: 'SME Owner',
    content:
      'The VAT calculation and tax reporting features alone are worth the subscription. Highly recommended!',
    rating: 5,
  },
];

export const faqs = [
  {
    question: 'What types of businesses can use Rekordly?',
    answer:
      'Rekordly is designed for all types of Nigerian businesses - from freelancers and self-employed professionals to registered companies, SMEs, and larger enterprises.',
  },
  {
    question: 'Is Rekordly compliant with Nigerian tax regulations?',
    answer:
      'Yes! Rekordly is built specifically for the Nigerian market and generates FIRS-compliant reports, calculates VAT correctly, and helps you prepare for tax filing.',
  },
  {
    question: 'Do I need accounting knowledge to use Rekordly?',
    answer:
      'Not at all! Rekordly simplifies professional accounting with an intuitive interface. The system handles complex accounting principles behind the scenes.',
  },
  {
    question: 'Can I import my existing financial data?',
    answer:
      'Yes, Rekordly supports importing data from Excel/CSV files. Our support team can help you migrate from other accounting systems.',
  },
  {
    question: 'How secure is my financial data?',
    answer:
      'We use bank-level encryption, secure servers, and regular backups to ensure your financial data is completely safe and compliant with data protection regulations.',
  },
  {
    question: 'Can multiple team members use the same account?',
    answer:
      'Yes! Our Growth and Enterprise plans support team collaboration with role-based access controls, allowing multiple team members to work on the same accounts.',
  },
];

export const stats = [
  { value: '₦2.5M+', label: 'Transactions Tracked' },
  { value: '1,200+', label: 'Active Users' },
  { value: '99.9%', label: 'Uptime Reliability' },
];

export const VAT_RATE = 0.075;

export const paymentMethods = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card Payment' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

export const UNIT_OPTIONS = [
  { label: 'Unit', value: 'unit' },
  { label: 'Piece', value: 'piece' },
  { label: 'Kg', value: 'kg' },
  { label: 'Gram', value: 'gram' },
  { label: 'Liter', value: 'liter' },
  { label: 'Meter', value: 'meter' },
  { label: 'Box', value: 'box' },
  { label: 'Pack', value: 'pack' },
  { label: 'Bag', value: 'bag' },
  { label: 'Dozen', value: 'dozen' },
];

export const ASSET_CATEGORIES = [
  { label: 'Land', value: 'LAND' },
  { label: 'Building', value: 'BUILDING' },
  { label: 'Vehicle', value: 'VEHICLE' },
  { label: 'Machinery', value: 'MACHINERY' },
  { label: 'Equipment', value: 'EQUIPMENT' },
  { label: 'Furniture', value: 'FURNITURE' },
  { label: 'Computer', value: 'COMPUTER' },
  { label: 'Other', value: 'OTHER' },
];

export const INVENTORY_CATEGORIES = [
  { label: 'Raw Material', value: 'RAW_MATERIAL' },
  { label: 'Finished Good', value: 'FINISHED_GOOD' },
  { label: 'Service', value: 'SERVICE' },
  { label: 'Produced Item', value: 'PRODUCED_ITEM' },
  { label: 'Consumable', value: 'CONSUMABLE' },
];

export type ItemTypeFilter =
  | 'ALL'
  | 'RAW_MATERIAL'
  | 'FINISHED_GOOD'
  | 'SERVICE'
  | 'PRODUCED_ITEM'
  | 'CONSUMABLE';

export const ITEM_TYPE_FILTERS = [
  { label: 'All Types', value: 'ALL' as ItemTypeFilter },
  { label: 'Raw Material', value: 'RAW_MATERIAL' as ItemTypeFilter },
  { label: 'Finished Good', value: 'FINISHED_GOOD' as ItemTypeFilter },
  { label: 'Service', value: 'SERVICE' as ItemTypeFilter },
  { label: 'Produced Item', value: 'PRODUCED_ITEM' as ItemTypeFilter },
  { label: 'Consumable', value: 'CONSUMABLE' as ItemTypeFilter },
];
