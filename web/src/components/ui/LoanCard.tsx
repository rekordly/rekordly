'use client';

import { useRouter } from 'next/navigation';
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  Calendar,
  User,
  Percent,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
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
  Progress,
} from '@heroui/react';
import { Loan } from '@/types/loan';
import { formatCurrency, formatDate } from '@/lib/fn';

interface LoanCardProps {
  loan: Loan;
  onEdit: (loan: Loan) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return {
        icon: Clock,
        chipColor: 'primary' as const,
        label: 'Active',
      };
    case 'PAID_OFF':
      return {
        icon: CheckCircle,
        chipColor: 'success' as const,
        label: 'Paid Off',
      };
    case 'DEFAULTED':
      return {
        icon: XCircle,
        chipColor: 'danger' as const,
        label: 'Defaulted',
      };
    case 'RESTRUCTURED':
      return {
        icon: RefreshCw,
        chipColor: 'warning' as const,
        label: 'Restructured',
      };
    case 'WRITTEN_OFF':
      return {
        icon: AlertCircle,
        chipColor: 'default' as const,
        label: 'Written Off',
      };
    default:
      return {
        icon: Clock,
        chipColor: 'default' as const,
        label: status,
      };
  }
};

const getTypeConfig = (loanType: string) => {
  if (loanType === 'RECEIVABLE') {
    return {
      icon: TrendingUp,
      chipColor: 'success' as const,
      label: 'Loan Given',
      description: 'Money you lent',
    };
  }
  return {
    icon: TrendingDown,
    chipColor: 'danger' as const,
    label: 'Loan Received',
    description: 'Money you borrowed',
  };
};

const getFrequencyLabel = (frequency: string) => {
  const labels: Record<string, string> = {
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    BIWEEKLY: 'Bi-weekly',
    MONTHLY: 'Monthly',
    QUARTERLY: 'Quarterly',
    ANNUALLY: 'Annually',
    ONE_TIME: 'One-time',
  };
  return labels[frequency] || frequency;
};

export function LoanCard({
  loan,
  onEdit,
  onDelete,
  isDeleting,
}: LoanCardProps) {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const statusConfig = getStatusConfig(loan.status);
  const typeConfig = getTypeConfig(loan.loanType);
  const StatusIcon = statusConfig.icon;
  const TypeIcon = typeConfig.icon;

  // Calculate repayment progress
  const totalAmount = loan.principalAmount;
  const paidAmount = loan.totalPaid;
  const progressPercentage =
    totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

  const handleClick = () => {
    router.push(`/dashboard/loans/${loan.loanNumber}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(loan);
  };

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(loan.id);
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to delete loan',
        color: 'danger',
      });
    }
  };

  const partyName = loan.partyName || 'N/A';

  return (
    <>
      <div
        className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-primary/20"
        onClick={handleClick}
      >
        {/* Top Row: Type Icon & Loan Number */}
        <div className="flex items-start gap-3 mb-3">
          <Chip
            className="w-9 h-9 px-0 rounded-xl items-center justify-center shrink-0"
            color={typeConfig.chipColor}
            variant="solid"
          >
            <TypeIcon size={16} />
          </Chip>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-medium text-default-500 truncate">
                {loan.loanNumber}
              </span>
              <Tooltip content={typeConfig.description} size="sm">
                <div className="flex items-center shrink-0">
                  <Banknote size={12} className="text-default-400" />
                </div>
              </Tooltip>
            </div>
            <h3 className="text-sm font-semibold text-foreground line-clamp-1 leading-tight">
              {loan.purpose || `${typeConfig.label} - ${partyName}`}
            </h3>
          </div>

          {/* Status Chip */}
          <Chip
            className="h-6 shrink-0"
            color={statusConfig.chipColor}
            size="sm"
            variant="flat"
            startContent={<StatusIcon size={12} />}
          >
            <span className="text-[0.65rem] font-medium">
              {statusConfig.label}
            </span>
          </Chip>
        </div>

        {/* Amount Row with Party Name */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(loan.principalAmount)}
            </p>
            <span className="text-xs text-default-500">
              {loan.interestRate}% p.a.
            </span>
          </div>

          <div className="flex flex-col gap-0.5 text-right">
            <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
              {loan.loanType === 'RECEIVABLE' ? 'Borrower' : 'Lender'}
            </p>
            <p className="text-xs font-medium text-default-700 truncate max-w-[120px]">
              {partyName}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        {loan.status === 'ACTIVE' && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Repayment Progress
              </span>
              <span className="text-[0.65rem] font-semibold text-default-600">
                {progressPercentage.toFixed(1)}%
              </span>
            </div>
            <Progress
              size="sm"
              value={progressPercentage}
              color={progressPercentage === 100 ? 'success' : 'primary'}
              className="h-1.5"
            />
          </div>
        )}

        {/* Balance & Paid Row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-danger-50 dark:bg-danger-900/20 rounded-lg px-3 py-2">
            <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium mb-0.5">
              Balance
            </p>
            <p className="text-sm font-bold text-danger-600">
              {formatCurrency(loan.currentBalance)}
            </p>
          </div>
          <div className="bg-success-50 dark:bg-success-900/20 rounded-lg px-3 py-2">
            <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium mb-0.5">
              Paid
            </p>
            <p className="text-sm font-bold text-success-600">
              {formatCurrency(loan.totalPaid)}
            </p>
          </div>
        </div>

        {/* Footer Row: Frequency, Start Date & Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Payment Frequency */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Frequency
              </p>
              <p className="text-xs font-medium text-default-700 whitespace-nowrap">
                {getFrequencyLabel(loan.paymentFrequency)}
              </p>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Start Date
              </p>
              <p className="text-xs font-medium text-default-700 whitespace-nowrap">
                {formatDate(loan.startDate)}
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
              title="Edit loan"
              variant="light"
              onClick={handleEdit}
              aria-label="Edit loan"
            >
              <Edit size={16} />
            </Button>
            <Button
              isIconOnly
              aria-label="Delete loan"
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
                Delete Loan
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this loan record? This action
                  cannot be undone and will remove all associated payment
                  records.
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
