'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, addToast } from '@heroui/react';
import { ArrowLeft, FileX } from 'lucide-react';

import { useLoanStore } from '@/store/loan-store';

import { LoanInfoSection } from '@/components/dashboard/loan/single/LoanInfoSection';
import { LoanPaymentSchedule } from '@/components/dashboard/loan/single/LoanPaymentSchedule';
import { CustomerInfoSection } from '@/components/dashboard/CustomerInfoSection';
import { PaymentSection } from '@/components/dashboard/PaymentSection';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { Handshake } from '@phosphor-icons/react';
import { EntityHeader } from '@/components/dashboard/EntityHeader';
import { CreateLoanDrawer } from '@/components/drawer/CreateLoanDrawer';
import { ReceiptDownloadLayout } from '@/components/dashboard/ReceiptDownloadLayout';
import { downloadAsImage, downloadAsPDF } from '@/lib/downloadUtils';

export default function SingleLoan() {
  const params = useParams();
  const router = useRouter();

  const loanNumber = params.id as string;

  const loan = useLoanStore(state =>
    state.allLoans.find(l => l.loanNumber === loanNumber)
  );
  const { fetchLoans, isInitialLoading, updateLoan } = useLoanStore();

  const [notFound, setNotFound] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadLoan = async () => {
      const cachedLoan = useLoanStore
        .getState()
        .allLoans.find(l => l.loanNumber === loanNumber);

      if (cachedLoan) {
        setNotFound(false);
        setIsFetching(true);
        await fetchLoans();
        setIsFetching(false);
        return;
      }

      setIsFetching(true);
      try {
        await fetchLoans();

        const fetchedLoan = useLoanStore
          .getState()
          .allLoans.find(l => l.loanNumber === loanNumber);

        if (!fetchedLoan) {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching loans:', error);
        setNotFound(true);
      } finally {
        setIsFetching(false);
      }
    };

    loadLoan();
  }, [loanNumber, fetchLoans]);

  const handleShare = async () => {
    if (!loan) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      // Add toast notification here
    } catch (error) {
      // Add error toast here
    }
  };

  const handleDownloadPDF = async (layoutStyle: 'professional' | 'default') => {
    if (!loan || loan.totalPaid <= 0 || !receiptRef.current) return;
    try { await downloadAsPDF(receiptRef.current, `receipt-${loan.loanNumber}`); }
    catch { addToast({ title: 'Receipt download failed', description: 'Please try again.', color: 'danger' }); }
  };

  const handleDownloadImage = async (
    layoutStyle: 'professional' | 'default'
  ) => {
    if (!loan || loan.totalPaid <= 0 || !receiptRef.current) return;
    try { await downloadAsImage(receiptRef.current, `receipt-${loan.loanNumber}`); }
    catch { addToast({ title: 'Receipt download failed', description: 'Please try again.', color: 'danger' }); }
  };

  // Updated handler for payment success
  const handlePaymentSuccess = (data: any) => {
    if (data.loan && loan) {
      updateLoan(loan.id, data.loan);
    }

    if (data.entity && loan) {
      updateLoan(loan.id, data.entity);
    }
  };

  const handlePaymentUpdate = () => {
    // This just triggers a refresh - the actual update happens in handlePaymentSuccess
  };

  const showSkeleton = !loan && (isInitialLoading || isFetching);

  if (showSkeleton) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 -mt-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <div className="lg:grid lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
          <div className="space-y-6 mt-6 lg:mt-0">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !loan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-full p-6">
          <FileX className="text-danger-500" size={48} />
        </div>
        <h3 className="text-xl font-semibold">Loan Not Found</h3>
        <p className="text-default-500 text-center max-w-md">
          The loan <span className="font-mono text-sm">{loanNumber}</span>
          {` doesn't exist or may have been deleted.`}
        </p>
        <Button
          color="primary"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push('/dashboard/loans')}
        >
          Back to Loans
        </Button>
      </div>
    );
  }

  // Convert loan payments to PaymentRecord format
  const payments =
    loan.payments?.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      payableType: payment.payableType,
      paymentDate: payment.paymentDate,
      reference: payment.reference,
      notes: payment.notes,
      category:
        loan.loanType === 'RECEIVABLE'
          ? ('INCOME' as 'INCOME')
          : ('EXPENSE' as 'EXPENSE'),
    })) || [];

  return (
    <div className="max-w-7xl mx-auto">
      <EntityHeader
        entity="loans"
        onEdit={() => setIsEditOpen(true)}
        onDownloadImage={loan.totalPaid > 0 ? handleDownloadImage : undefined}
        onDownloadPDF={loan.totalPaid > 0 ? handleDownloadPDF : undefined}
        onShare={handleShare}
      />
      {loan.totalPaid > 0 && (
        <div ref={receiptRef} style={{ position: 'absolute', left: '-100000px', top: 0 }}>
          <ReceiptDownloadLayout data={{
            number: loan.loanNumber,
            customerName: loan.partyName,
            customerEmail: loan.partyEmail,
            customerPhone: loan.partyPhone,
            date: loan.startDate,
            title: loan.loanType === 'RECEIVABLE' ? 'Loan repayment received' : 'Loan payment receipt',
            description: loan.purpose,
            totalAmount: loan.principalAmount + loan.totalCharges,
            amountPaid: loan.totalPaid,
            balance: loan.currentBalance,
            payments,
          }} />
        </div>
      )}

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 mt-6 lg:mt-0">
        <div className="lg:col-span-2 space-y-6">
          <LoanInfoSection loan={loan} />
          <LoanPaymentSchedule loan={loan} />

          {payments.length > 0 && (
            <div className="lg:hidden">
              <PaymentSection
                totalAmount={loan.principalAmount + loan.totalCharges}
                amountPaid={loan.totalPaid}
                balance={loan.currentBalance}
                payments={payments}
                showActions={true}
                onPaymentUpdate={handlePaymentUpdate}
                entityType="loan"
                entityId={loan.id}
              />
            </div>
          )}
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          <CustomerInfoSection
            name={loan.partyName}
            email={loan.partyEmail}
            phone={loan.partyPhone}
            title={
              loan.loanType === 'RECEIVABLE'
                ? 'Borrower Information'
                : 'Lender Information'
            }
            icon={<Handshake className="w-5 h-5 text-primary" />}
          />

          <div className="hidden lg:block">
            <PaymentSection
              totalAmount={loan.principalAmount + loan.totalCharges}
              amountPaid={loan.totalPaid}
              balance={loan.currentBalance}
              payments={payments}
              showActions={true}
              onPaymentUpdate={handlePaymentUpdate}
              entityType="loan"
              entityId={loan.id}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {loan.status === 'ACTIVE' && loan.currentBalance > 0 && (
              <AddPaymentModal
                entityType="loan"
                entityId={loan.id}
                entityNumber={loan.loanNumber}
                totalAmount={loan.principalAmount + loan.totalCharges}
                amountPaid={loan.totalPaid}
                balance={loan.currentBalance}
                onSuccess={handlePaymentSuccess}
              />
            )}
          </div>
        </div>
      </div>
      <CreateLoanDrawer
        isOpen={isEditOpen}
        loanId={loan.id}
        onClose={() => setIsEditOpen(false)}
        onSuccess={async () => {
          setIsEditOpen(false);
          await fetchLoans(true);
        }}
      />
    </div>
  );
}
