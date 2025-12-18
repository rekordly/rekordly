'use client';

import { useRouter } from 'next/navigation';
import {
  FileText,
  ShoppingCart,
  DollarSign,
  Edit,
  Trash2,
  TrendingUp,
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
import { Income } from '@/types/income';
import { formatCurrency, formatDate } from '@/lib/fn';

interface IncomeCardProps {
  income: Income;
  onOtherIncomeClick: (income: Income) => void;
  onEdit: (income: Income) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

const getSourceConfig = (sourceType: string) => {
  switch (sourceType) {
    case 'QUOTATION':
      return {
        icon: FileText,
        chipColor: 'primary' as const,
        label: 'Quotation',
      };
    case 'SALE':
      return {
        icon: ShoppingCart,
        chipColor: 'success' as const,
        label: 'Sale',
      };
    case 'OTHER_INCOME':
      return {
        icon: DollarSign,
        chipColor: 'warning' as const,
        label: 'Other Income',
      };
    case 'PURCHASE_REFUND':
      return {
        icon: TrendingUp,
        chipColor: 'secondary' as const,
        label: 'Purchase Refund',
      };
    default:
      return {
        icon: DollarSign,
        chipColor: 'default' as const,
        label: 'Income',
      };
  }
};

export function IncomeCard({
  income,
  onOtherIncomeClick,
  onEdit,
  onDelete,
  isDeleting,
}: IncomeCardProps) {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const config = getSourceConfig(income.sourceType);
  const Icon = config.icon;

  const handleClick = () => {
    if (income.sourceType === 'OTHER_INCOME') {
      onOtherIncomeClick(income);
    } else if (income.sourceNumber) {
      const sourceTypeMap: Record<string, string> = {
        QUOTATION: 'quotations',
        SALE: 'sales',
        PURCHASE_REFUND: 'purchases',
      };
      const route = sourceTypeMap[income.sourceType];
      if (route) {
        router.push(`/dashboard/${route}/${income.sourceNumber}`);
      }
    }
  };

  const handleEdit = () => {
    onEdit(income);
  };

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(income.id);
      onClose();

      // addToast({
      //   title: 'Success',
      //   description: 'Income deleted successfully',
      //   color: 'success',
      // });
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete income',
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
            className="w-9 h-9 px-0 rounded-xl items-center justify-center shrink-0"
            color={config.chipColor}
            variant="solid"
          >
            {Icon && <Icon size={16} />}
          </Chip>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-medium text-default-500">
                {income.sourceNumber || income.sourceId}
              </span>
              <Tooltip content="Income" size="sm">
                <div className="flex items-center">
                  <TrendingUp size={12} className="text-default-400" />
                </div>
              </Tooltip>
            </div>
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
              {income.customSubCategory ||
                income.incomeSubCategory ||
                income.sourceTitle}
            </h3>
          </div>
        </div>

        {/* Amount & Status Row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(income.sourceAmountPaid || income.amount)}
          </p>

          <Chip
            className="h-6 shrink-0"
            color={config.chipColor}
            size="sm"
            variant="flat"
          >
            <span className="text-[0.65rem] font-medium">
              {income.incomeMainCategory || config.label}
            </span>
          </Chip>
        </div>

        {/* Footer Row: Customer/Vendor & Date & Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                {income.vendorName ? 'Vendor' : 'Customer'}
              </p>
              <p className="text-xs font-medium text-default-700 truncate">
                {income.vendorName || income.customerName || 'N/A'}
              </p>
            </div>

            <div className="flex flex-col gap-0.5 shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Date
              </p>
              <p className="text-xs font-medium text-default-700 whitespace-nowrap">
                {formatDate(income.date)}
              </p>
            </div>
          </div>

          {/* Edit & Delete Buttons */}
          <div
            className="flex gap-1 shrink-0 ml-2"
            onClick={e => e.stopPropagation()}
          >
            <Button
              isIconOnly
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="primary"
              size="sm"
              title="Edit income"
              variant="light"
              onPress={handleEdit}
              aria-label="Edit income"
            >
              <Edit size={16} />
            </Button>
            <Button
              isIconOnly
              aria-label="Delete income"
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
                Delete Income
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this income record? This
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
