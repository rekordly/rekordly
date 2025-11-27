'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, addToast } from '@heroui/react';
import { ArrowLeft, FileX } from '@phosphor-icons/react';
import { useSession } from 'next-auth/react';

import { useQuotationStore } from '@/store/quotationStore';
import QuotationHeader from '@/components/dashboard/quotations/single/QuotationHeader';
import AddQuotationPayment from '@/components/dashboard/quotations/single/AddQuotationPayment';
import QuotationInfoSection from '@/components/dashboard/quotations/single/QuotationInfoSection';
import QuotationItemsSection from '@/components/dashboard/quotations/single/QuotationItemsSection';
import QuotationCustomerSection from '@/components/dashboard/quotations/single/QuotationCustomerSection';
import QuotationPaymentSection from '@/components/dashboard/quotations/single/QuotationPaymentSection';

import { PaymentSection } from '@/components/dashboard/PaymentSection';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { RefundModal } from '@/components/modals/RefundModal';
import { CustomerInfoSection } from '@/components/dashboard/CustomerInfoSection';
import { RefundInfoSection } from '@/components/dashboard/RefundInfoSection';

export default function SingleQuotation() {
  const params = useParams();
  const router = useRouter();
  const { data } = useSession();

  const businessInfo = {
    name: data?.user.onboarding?.businessName || data?.user.name || '',
    email: data?.user.email || '',
    phone: data?.user.onboarding?.phoneNumber || '',
  };

  const quotationNumber = params.id as string;

  const quotation = useQuotationStore(state =>
    state.allQuotations.find(quot => quot.quotationNumber === quotationNumber)
  );
  const { fetchQuotations, updateQuotation, isInitialLoading } =
    useQuotationStore();

  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const loadQuotation = async () => {
      const cachedQuotation = useQuotationStore
        .getState()
        .allQuotations.find(quot => quot.quotationNumber === quotationNumber);

      if (cachedQuotation) {
        setNotFound(false);
        setIsFetching(true);
        await fetchQuotations();
        setIsFetching(false);

        return;
      }

      setIsFetching(true);
      try {
        await fetchQuotations();

        const fetchedQuotation = useQuotationStore
          .getState()
          .allQuotations.find(quot => quot.quotationNumber === quotationNumber);

        if (!fetchedQuotation) {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching quotations:', error);
        setNotFound(true);
      } finally {
        setIsFetching(false);
      }
    };

    loadQuotation();
  }, [quotationNumber, fetchQuotations]);

  const handleShare = async () => {
    if (!quotation) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast({
        title: 'Link Copied',
        description: 'Quotation link copied to clipboard',
        color: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Error',
        description: 'Failed to copy link',
        color: 'danger',
      });
    }
  };

  const handleDownloadPDF = async (layoutStyle: 'professional' | 'default') => {
    // Implement download logic
    addToast({
      title: 'Coming Soon',
      description: 'PDF download feature coming soon',
      color: 'default',
    });
  };

  const handleDownloadImage = async (
    layoutStyle: 'professional' | 'default'
  ) => {
    // Implement download logic
    addToast({
      title: 'Coming Soon',
      description: 'Image download feature coming soon',
      color: 'default',
    });
  };

  const handleRefundSuccess = (data: any) => {
    if (data.quotation && quotation) {
      updateQuotation(quotation.id, data.quotation);
    }
  };

  const handlePaymentSuccess = (data: any) => {
    if (data.quotation && quotation) {
      updateQuotation(quotation.id, data.quotation);
    }

    if (data.entity && quotation) {
      updateQuotation(quotation.id, data.entity);
    }
  };

  const handlePaymentUpdate = () => {};

  const showSkeleton = !quotation && (isInitialLoading || isFetching);

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

  if (notFound || !quotation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-full p-6">
          <FileX className="text-danger-500" size={48} />
        </div>
        <h3 className="text-xl font-semibold">Quotation Not Found</h3>
        <p className="text-default-500 text-center max-w-md">
          The quotation{' '}
          <span className="font-mono text-sm">{quotationNumber}</span>
          {`doesn't exist or may have been deleted.`}
        </p>
        <Button
          color="primary"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push('/dashboard/quotation')}
        >
          Back to Quotations
        </Button>
      </div>
    );
  }

  const canRefund =
    quotation.amountPaid > 0 &&
    (quotation.status === 'PAID' || quotation.status === 'PARTIALLY_PAID') &&
    !quotation.refundAmount;
  const refunded =
    quotation.status === 'REFUNDED' ||
    quotation.status === 'PARTIALLY_REFUNDED';

  return (
    <div className="max-w-7xl mx-auto">
      <QuotationHeader
        isDownloading={isDownloading}
        onDownloadImage={handleDownloadImage}
        onDownloadPDF={handleDownloadPDF}
        onShare={handleShare}
      />

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 mt-6 lg:mt-0">
        <div className="lg:col-span-2 space-y-6">
          <QuotationInfoSection quotation={quotation} />
          <RefundInfoSection
            refundAmount={quotation.refundAmount || 0}
            refundDate={quotation.refundDate}
            refundReason={quotation.refundReason}
            status={quotation.status}
          />
          <QuotationItemsSection quotation={quotation} />
          {quotation.payments && quotation.payments.length > 0 && (
            <div className="lg:hidden">
              <PaymentSection
                totalAmount={quotation.totalAmount}
                amountPaid={quotation.amountPaid}
                balance={quotation.balance}
                payments={quotation.payments}
                showActions={true}
                onPaymentUpdate={handlePaymentUpdate}
                entityType="quotation"
                entityId={quotation.id}
              />
            </div>
          )}
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          {/* <QuotationCustomerSection quotation={quotation} /> */}
          <CustomerInfoSection
            name={quotation.customer?.name || quotation.customerName}
            email={quotation.customer?.email || quotation.customerEmail}
            phone={quotation.customer?.phone || quotation.customerPhone}
            // title="Billed To"
          />

          <div className="hidden lg:block">
            <PaymentSection
              totalAmount={quotation.totalAmount}
              amountPaid={quotation.amountPaid}
              balance={quotation.balance}
              payments={quotation.payments}
              showActions={true}
              onPaymentUpdate={handlePaymentUpdate}
              entityType="quotation"
              entityId={quotation.id}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {quotation.status !== 'PAID' && !refunded && (
              <AddPaymentModal
                entityType="quotation"
                entityId={quotation.id}
                entityNumber={quotation.quotationNumber}
                totalAmount={quotation.totalAmount}
                amountPaid={quotation.amountPaid}
                balance={quotation.balance}
                onSuccess={handlePaymentSuccess}
              />
            )}
            {canRefund && (
              <RefundModal
                amountPaid={quotation.amountPaid}
                itemId={quotation.id}
                itemNumber={quotation.quotationNumber}
                itemType="quotation"
                totalAmount={quotation.totalAmount}
                onSuccess={handleRefundSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
