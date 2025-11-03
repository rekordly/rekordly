import { InvoiceStatus } from '@/types/invoice';

import {
  FileText,
  Mail,
  BadgeCheck,
  Clock,
  Ban,
  ArrowRightLeft,
  LucideIcon,
} from 'lucide-react';

interface StatusConfig {
  icon: LucideIcon;
  chipColor:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'danger';
}

export function getStatusConfig(status: InvoiceStatus): StatusConfig {
  const configs: Record<InvoiceStatus, StatusConfig> = {
    DRAFT: {
      chipColor: 'secondary',
      icon: FileText,
    },
    SENT: {
      chipColor: 'success',
      icon: Mail,
    },
    OVERDUE: {
      chipColor: 'danger',
      icon: Clock,
    },
    CANCELLED: {
      chipColor: 'danger',
      icon: Ban,
    },
    CONVERTED: {
      chipColor: 'primary',
      icon: ArrowRightLeft,
    },
  };

  return configs[status] || configs.DRAFT;
}

export const getAlertColor = (
  type: 'error' | 'info' | 'success' | 'warning'
) => {
  switch (type) {
    case 'error':
      return 'danger' as const;
    case 'info':
      return 'primary' as const;
    case 'success':
      return 'success' as const;
    case 'warning':
      return 'warning' as const;
    default:
      return 'default' as const;
  }
};

export const STATUS_TAGS: {
  label: string;
  value: InvoiceStatus | 'ALL';
  color: any;
}[] = [
  { label: 'All', value: 'ALL', color: 'default' },
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Sent', value: 'SENT', color: 'primary' },
  { label: 'Converted', value: 'CONVERTED', color: 'primary' },
  { label: 'Overdue', value: 'OVERDUE', color: 'danger' },
  { label: 'Cancelled', value: 'CANCELLED', color: 'danger' },
];

export function generateInvoiceNumber(userId: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const userIdPart = userId.slice(-4).toUpperCase();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `INV-${year}${month}${day}${hours}${minutes}${seconds}-${userIdPart}-${random}`;
}

export function generateReceiptNumber(userId: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const userIdPart = userId.slice(-4).toUpperCase();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `REC-${year}${month}${day}${hours}${minutes}${seconds}-${userIdPart}-${random}`;
}

export const toTwoDecimals = (value: number | null): number => {
  if (value === null || value === undefined) return 0;
  return parseFloat(value.toFixed(2));
};

export function formatCurrency(
  amount: number,
  showSymbol: boolean = true
): string {
  const formatted = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return showSymbol ? `₦${formatted}` : formatted;
}

export function formatDate(
  date: string | Date,
  format: 'short' | 'long' | 'full' = 'long'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  switch (format) {
    case 'short':
      // "Oct 25, 24"
      return dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      });

    case 'long':
      // "Oct 25, 2024 14:30"
      return dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    case 'full':
      // "October 25, 2024 at 2:30 PM"
      return dateObj.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

    default:
      return dateObj.toLocaleDateString();
  }
}

export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  if (diffInSeconds < 31536000)
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;

  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
}

export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    DRAFT: 'default',
    SENT: 'primary',
    PAID: 'success',
    PARTIALLY_PAID: 'warning',
    OVERDUE: 'danger',
    CANCELLED: 'default',
    CONVERTED: 'secondary',
  };

  return statusMap[status] || 'default';
}

export function calculatePercentage(value: number, total: number): string {
  if (total === 0) return '0.0';
  return ((value / total) * 100).toFixed(1);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 11) {
    return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
  }

  return phone;
}

export function getInitials(name: string): string {
  const names = name.trim().split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
}
