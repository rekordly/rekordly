'use client';

import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  DollarSign,
  RefreshCw,
  Edit,
  Trash2,
  Wrench,
  Zap,
  Users,
  FileText,
  Shield,
  Award,
  Megaphone,
  CreditCard,
  GraduationCap,
  TrendingDown,
  AlertCircle,
  Heart,
  Percent,
  Lightbulb,
  Coffee,
  Home,
  Car,
  XCircle,
  Gift,
  Banknote,
  User,
  Package,
  Receipt,
} from 'lucide-react';
import {
  Chip,
  Button,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tooltip,
  addToast,
} from '@heroui/react';
import { Expense } from '@/types/expenses';
import { formatCurrency, formatDate } from '@/lib/fn';

interface ExpenseCardProps {
  expense: Expense;
  onOtherExpenseClick: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

const getCategoryConfig = (category: string, sourceType: string) => {
  // For refunds, use source type
  if (sourceType === 'SALE_REFUND') {
    return {
      icon: RefreshCw,
      chipColor: 'warning' as const,
      label: 'Sale Refund',
    };
  }
  if (sourceType === 'QUOTATION_REFUND') {
    return {
      icon: RefreshCw,
      chipColor: 'primary' as const,
      label: 'Quotation Refund',
    };
  }

  // For other expenses, use category
  switch (category) {
    case 'COST_OF_GOODS':
      return {
        icon: Package,
        chipColor: 'danger' as const,
        label: 'Cost of Goods',
      };
    case 'RENT_RATES':
      return {
        icon: Home,
        chipColor: 'warning' as const,
        label: 'Rent & Rates',
      };
    case 'UTILITIES':
      return {
        icon: Zap,
        chipColor: 'primary' as const,
        label: 'Utilities',
      };
    case 'SALARIES_WAGES':
      return {
        icon: Users,
        chipColor: 'success' as const,
        label: 'Salaries & Wages',
      };
    case 'REPAIRS_MAINTENANCE':
      return {
        icon: Wrench,
        chipColor: 'secondary' as const,
        label: 'Repairs & Maintenance',
      };
    case 'OFFICE_SUPPLIES':
      return {
        icon: FileText,
        chipColor: 'default' as const,
        label: 'Office Supplies',
      };
    case 'SOFTWARE_SUBSCRIPTIONS':
      return {
        icon: Package,
        chipColor: 'primary' as const,
        label: 'Software',
      };
    case 'PROFESSIONAL_FEES':
      return {
        icon: Award,
        chipColor: 'warning' as const,
        label: 'Professional Fees',
      };
    case 'INSURANCE':
      return {
        icon: Shield,
        chipColor: 'success' as const,
        label: 'Insurance',
      };
    case 'LICENSES_PERMITS':
      return {
        icon: Award,
        chipColor: 'primary' as const,
        label: 'Licenses & Permits',
      };
    case 'ADVERTISING':
      return {
        icon: Megaphone,
        chipColor: 'warning' as const,
        label: 'Advertising',
      };
    case 'BANK_CHARGES':
      return {
        icon: CreditCard,
        chipColor: 'danger' as const,
        label: 'Bank Charges',
      };
    case 'TRAINING':
      return {
        icon: GraduationCap,
        chipColor: 'success' as const,
        label: 'Training',
      };
    case 'INTEREST_ON_DEBT':
      return {
        icon: TrendingDown,
        chipColor: 'danger' as const,
        label: 'Interest on Debt',
      };
    case 'BAD_DEBTS':
      return {
        icon: AlertCircle,
        chipColor: 'danger' as const,
        label: 'Bad Debts',
      };
    case 'DONATIONS':
      return {
        icon: Heart,
        chipColor: 'secondary' as const,
        label: 'Donations',
      };
    case 'DEPRECIATION':
      return {
        icon: Percent,
        chipColor: 'default' as const,
        label: 'Depreciation',
      };
    case 'RESEARCH_DEVELOPMENT':
      return {
        icon: Lightbulb,
        chipColor: 'primary' as const,
        label: 'R&D',
      };
    case 'ENTERTAINMENT':
      return {
        icon: Coffee,
        chipColor: 'warning' as const,
        label: 'Entertainment',
      };
    case 'PERSONAL_EXPENSES':
      return {
        icon: User,
        chipColor: 'secondary' as const,
        label: 'Personal Expenses',
      };
    case 'RESIDENTIAL_RENT':
      return {
        icon: Home,
        chipColor: 'primary' as const,
        label: 'Residential Rent',
      };
    case 'TRANSPORTATION':
      return {
        icon: Car,
        chipColor: 'success' as const,
        label: 'Transportation',
      };
    case 'FINES_PENALTIES':
      return {
        icon: XCircle,
        chipColor: 'danger' as const,
        label: 'Fines & Penalties',
      };
    case 'BENEFITS_IN_KIND':
      return {
        icon: Gift,
        chipColor: 'warning' as const,
        label: 'Benefits in Kind',
      };
    case 'NON_APPROVED_PENSION':
      return {
        icon: Banknote,
        chipColor: 'default' as const,
        label: 'Non-Approved Pension',
      };
    case 'PERSONAL_LIVING_EXPENSES':
      return {
        icon: User,
        chipColor: 'secondary' as const,
        label: 'Personal Living',
      };
    case 'PURCHASE':
      return {
        icon: ShoppingCart,
        chipColor: 'danger' as const,
        label: 'Purchase',
      };
    default:
      return {
        icon: DollarSign,
        chipColor: 'default' as const,
        label: 'Other Expense',
      };
  }
};

export function ExpenseCard({
  expense,
  onOtherExpenseClick,
  onEdit,
  onDelete,
  isDeleting,
}: ExpenseCardProps) {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const config = getCategoryConfig(
    expense.category as string,
    expense.sourceType
  );
  const Icon = config.icon;

  const handleClick = () => {
    if (expense.sourceType === 'OTHER_EXPENSES') {
      onOtherExpenseClick(expense);
    } else if (expense.sourceNumber) {
      const sourceTypeMap: Record<string, string> = {
        PURCHASE: 'purchases',
        SALE_REFUND: 'sales',
        QUOTATION_REFUND: 'quotations',
      };
      const route = sourceTypeMap[expense.sourceType];
      if (route) {
        router.push(`/dashboard/${route}/${expense.sourceNumber}`);
      }
    }
  };

  const handleEdit = () => {
    onEdit(expense);
  };

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(expense.id);
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete expense',
        color: 'danger',
      });
    }
  };

  return (
    <>
      <div
        className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-primary/20"
        onClick={handleClick}
      >
        {/* Top Row: Icon, ID & Title */}
        <div className="flex items-start gap-3 mb-3">
          <Chip
            className="w-9 h-9 px-0 rounded-xl items-center justify-center flex-shrink-0"
            color={config.chipColor}
            variant="solid"
          >
            {Icon && <Icon size={16} />}
          </Chip>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-medium text-default-500">
                {expense.sourceNumber || expense.id}
              </span>
              <Tooltip content="Expense" size="sm">
                <div className="flex items-center">
                  <Receipt size={12} className="text-default-400" />
                </div>
              </Tooltip>
            </div>
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
              {expense.subCategory || expense.sourceTitle}
            </h3>
          </div>
        </div>

        {/* Amount & Status Row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(expense.amount)}
          </p>

          <Chip
            className="h-6 flex-shrink-0"
            color={config.chipColor}
            size="sm"
            variant="flat"
          >
            <span className="text-[0.65rem] font-medium">{config.label}</span>
          </Chip>
        </div>

        {/* Footer Row: Vendor/Customer & Date & Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                {expense.customerName ? 'Customer' : 'Vendor'}
              </p>
              <p className="text-xs font-medium text-default-700 truncate">
                {expense.customerName || expense.vendorName || 'N/A'}
              </p>
            </div>

            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Date
              </p>
              <p className="text-xs font-medium text-default-700 whitespace-nowrap">
                {formatDate(expense.date)}
              </p>
            </div>
          </div>

          {/* Edit & Delete Buttons */}
          <div
            className="flex gap-1 flex-shrink-0 ml-2"
            onClick={e => e.stopPropagation()}
          >
            <Button
              isIconOnly
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="primary"
              size="sm"
              title="Edit expense"
              variant="light"
              onPress={handleEdit}
              aria-label="Edit expense"
            >
              <Edit size={16} />
            </Button>
            <Button
              isIconOnly
              aria-label="Delete expense"
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="danger"
              size="sm"
              variant="light"
              onPress={onOpen}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        placement="center"
        size="xs"
        onClose={onClose}
      >
        <ModalContent>
          {onClose => (
            <>
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                Delete Expense
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this expense record? This
                  action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  isDisabled={isDeleting}
                  variant="light"
                  onPress={onClose}
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isLoading={isDeleting}
                  onPress={handleDeleteConfirm}
                >
                  {isDeleting ? 'Deleting' : 'Delete'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
