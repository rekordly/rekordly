import {
  Receipt,
  FileText,
  Shield,
  BarChart3,
  Lock,
  Smartphone,
} from 'lucide-react';
export const features = [
  {
    icon: Receipt,
    title: 'Smart Transaction Tracking',
    description:
      'Record sales, income, and expenses effortlessly with automatic categorization and never lose track of your money flow.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Financial Insights',
    description:
      'Get instant visibility into your profit, expenses, and cash flow with beautiful visual dashboards.',
  },
  {
    icon: FileText,
    title: 'Auto-Generate Reports',
    description:
      'Create professional financial statements, receipts, and tax-ready summaries with one click.',
  },
  {
    icon: Shield,
    title: 'Tax Compliance Ready',
    description:
      "Stay ahead of Nigeria's digital tax requirements with organized records ready for FIRS compliance.",
  },
  {
    icon: Lock,
    title: 'Bank-Level Security',
    description:
      'Your financial data is encrypted and protected with enterprise-grade security standards.',
  },
  {
    icon: Smartphone,
    title: 'Mobile-First Design',
    description:
      'Access your records anywhere, anytime with our intuitive mobile app for iOS and Android.',
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
      'Receipt generation',
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
      'Advanced analytics & insights',
      'Custom categories',
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
