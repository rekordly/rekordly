import { InventoryType } from '@prisma/client';
import {
  Receipt,
  XCircle,
  CheckCircle,
  TrendUp,
  Package,
  Users,
  Storefront,
  ArrowsDownUp,
} from '@phosphor-icons/react';

export const features = [
  {
    icon: Package,
    title: 'Inventory Management',
    description:
      'Track stock levels, set low stock alerts, and manage raw materials for production.',
  },
  {
    icon: TrendUp,
    title: 'Profit Tracking',
    description:
      'See your real-time profitability. Calculate margins and understand your cash flow instantly.',
  },
  {
    icon: Receipt,
    title: 'Invoicing & Receipts',
    description:
      'Create professional invoices and receipts. Track debtors and see who owes you money.',
  },
  {
    icon: Users,
    title: 'Customer Management',
    description:
      'Keep track of your buyers and suppliers. View purchase history and payment status at a glance.',
  },
  {
    icon: ArrowsDownUp,
    title: 'Cash Flow Management',
    description:
      'Track money coming in and going out to avoid surprises and plan ahead.',
  },
  {
    icon: Storefront,
    title: 'Production & Recipes',
    description:
      'Manage manufacturing batches, define recipes, and calculate unit costs for your products.',
  },
];

export const list = [
  {
    id: 1,
    title: 'Set up your account',
    img: '/landing/card2.png',
    description:
      'Sign up in seconds and select your business type - retail, manufacturing, or services.',
  },
  {
    id: 2,
    title: 'Track your business',
    img: '/landing/card1.png',
    description:
      'Record sales, purchases, and inventory movement. We handle the numbers automatically.',
  },
  {
    id: 3,
    title: 'Grow your profit',
    img: '/landing/card3.png',
    description:
      'View profitability reports, manage debts, and make data-driven decisions.',
  },
];

export const businessTypes = [
  {
    icon: Storefront,
    title: 'Retail Stores',
    description:
      'Track inventory, manage sales, and keep stock levels perfect. Never lose a sale due to stockouts again.',
  },
  {
    icon: Users,
    title: 'Service Providers',
    description:
      'Track billable hours, invoice clients, and manage expenses. Perfect for freelancers and consultants.',
  },
  {
    icon: Package,
    title: 'Manufacturers',
    description:
      'Manage production batches, raw materials, and recipe costs. See exactly how much it costs to make your product.',
  },
  {
    icon: TrendUp,
    title: 'Freelancers',
    description:
      'Organize multiple income streams, track expenses, and generate professional financial summaries for your clients.',
  },
];

export const testimonials = [
  {
    quote:
      'Rekordly transformed how I manage my inventory. I never run out of stock anymore.',
    name: 'Chinedu O.',
    role: 'Retail Business Owner',
    avatar: 'https://i.pravatar.cc/150?img=1',
  },
  {
    quote:
      'As a freelancer, tracking multiple clients was hard. Now I know exactly who owes me.',
    name: 'Amina S.',
    role: 'Freelance Consultant',
    avatar: 'https://i.pravatar.cc/150?img=5',
  },
  {
    quote:
      'The production tracking feature is a lifesaver. I can calculate exact costs for every batch.',
    name: 'Emeka N.',
    role: 'Manufacturing SME Owner',
    avatar: 'https://i.pravatar.cc/150?img=9',
  },
  {
    quote:
      "It's the only tool I use daily - it makes running my small business feel manageable.",
    name: 'Funke A.',
    role: 'Self-Employed Professional',
    avatar: 'https://i.pravatar.cc/150?img=12',
  },
  {
    quote:
      'No more spreadsheet chaos. Just clean, clear numbers and profit tracking.',
    name: 'Tunde B.',
    role: 'Startup Founder',
    avatar: 'https://i.pravatar.cc/150?img=15',
  },
  {
    quote:
      'The invoicing feature is professional and helped me get paid much faster.',
    name: 'Grace O.',
    role: 'Small Business Owner',
    avatar: 'https://i.pravatar.cc/150?img=20',
  },
  {
    quote:
      'Finally, an app that understands that I need to see profit, not just accounting ledgers.',
    name: 'David R.',
    role: 'Creative Director',
    avatar: 'https://i.pravatar.cc/150?img=25',
  },
  {
    quote:
      'Rekordly helped me organize my side hustle and track expenses effortlessly.',
    name: 'Bisi A.',
    role: 'Content Writer',
    avatar: 'https://i.pravatar.cc/150?img=30',
  },
];

export const comparisonData = [
  {
    title: 'Traditional Spreadsheets',
    accent: 'danger',
    icon: XCircle,
    items: [
      'Prone to errors and manual calculation mistakes',
      'Hard to track stock across multiple items',
      'No clear view of who owes you money',
      'Difficult to share with team or accountant',
      'Time-consuming to create invoices',
    ],
  },
  {
    title: 'Rekordly',
    accent: 'success',
    icon: CheckCircle,
    highlight: true,
    items: [
      'Real-time profit and inventory tracking',
      'Simple, all-in-one dashboard',
      'Automated debt and customer tracking',
      'Generate professional invoices instantly',
      'Secure cloud access anywhere',
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
      'Basic inventory tracking',
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
      'Advanced inventory & production',
      'Profit & loss reports',
      'Priority support',
      'Team collaboration (up to 3)',
      'Export to Excel & PDF',
      'Debt tracking & aging reports',
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
      'Rekordly transformed how I manage my inventory. No more stockouts or chaos.',
    rating: 5,
  },
  {
    name: 'Amina S.',
    role: 'Freelance Consultant',
    content:
      'Tracking clients and invoices is now effortless. I get paid faster.',
    rating: 5,
  },
  {
    name: 'Emeka N.',
    role: 'SME Owner',
    content:
      'The production tracking and inventory features have saved me hours every week.',
    rating: 5,
  },
];

export const faqs = [
  {
    question: 'What types of businesses can use Rekordly?',
    answer:
      'Rekordly is designed for all Nigerian businesses - from freelancers and self-employed professionals to retail stores, manufacturers, and service providers.',
  },
  {
    question: 'Do I need accounting knowledge to use Rekordly',
    answer:
      'Not at all! Rekordly simplifies professional accounting with an intuitive interface. The system handles complex accounting principles behind the scenes.',
  },
  {
    question: 'Does Rekordly handle inventory?',
    answer:
      'Yes! We have robust inventory management. You can track stock levels, set low stock alerts, manage raw materials, and even handle production batches and recipes.',
  },
  {
    question: 'Can I use Rekordly on my phone?',
    answer:
      'Yes, Rekordly is mobile-first. Our responsive web app works perfectly on all devices, and a dedicated mobile app is coming soon.',
  },
  {
    question: 'Can I track who owes me money?',
    answer:
      'Absolutely. Rekordly automatically tracks unpaid sales and purchases, giving you a clear list of debtors and creditors with aging reports.',
  },
  {
    question: 'Can multiple users use the same Rekordly account?',
    answer:
      'Not yet. Currently, Rekordly supports single-user access per account. However, multi-user support with team collaboration is already planned and will be rolled out in a future update.',
  },
  {
    question: 'How does the pricing work?',
    answer:
      'We offer transparent monthly pricing with no hidden fees. Start with our free plan and upgrade anytime as your business grows.',
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
