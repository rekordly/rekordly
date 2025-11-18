'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, addToast } from '@heroui/react';
import { ArrowLeft, FileX } from '@phosphor-icons/react';

import { useSaleStore } from '@/store/saleStore';
import { SaleHeader } from '@/components/dashboard/sales/single/SaleHeader';
import { SaleInfoSection } from '@/components/dashboard/sales/single/SaleInfoSection';
import { SaleItemsSection } from '@/components/dashboard/sales/single/SaleItemsSection';
import { SaleCustomerSection } from '@/components/dashboard/sales/single/SaleCustomerSection';
import { SalePaymentSection } from '@/components/dashboard/sales/single/SalePaymentSection';
import { AddSalePayment } from '@/components/dashboard/sales/single/AddSalePayment';
import { RefundModal } from '@/components/modals/RefundModal';

export default function SingleSale() {
  const params = useParams();
  const router = useRouter();

  const receiptNumber = params.id as string;

  const sale = useSaleStore(state =>
    state.allSales.find(s => s.receiptNumber === receiptNumber)
  );
  const { fetchSales, isInitialLoading, updateSale } = useSaleStore();

  const [notFound, setNotFound] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const loadSale = async () => {
      const cachedSale = useSaleStore
        .getState()
        .allSales.find(s => s.receiptNumber === receiptNumber);

      if (cachedSale) {
        setNotFound(false);
        setIsFetching(true);
        await fetchSales();
        setIsFetching(false);
        return;
      }

      setIsFetching(true);
      try {
        await fetchSales();

        const fetchedSale = useSaleStore
          .getState()
          .allSales.find(s => s.receiptNumber === receiptNumber);

        if (!fetchedSale) {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching sales:', error);
        setNotFound(true);
      } finally {
        setIsFetching(false);
      }
    };

    loadSale();
  }, [receiptNumber, fetchSales]);

  const handleShare = async () => {
    if (!sale) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast({
        title: 'Link Copied',
        description: 'Sale link copied to clipboard',
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
    addToast({
      title: 'Coming Soon',
      description: 'PDF download feature coming soon',
      color: 'default',
    });
  };

  const handleDownloadImage = async (
    layoutStyle: 'professional' | 'default'
  ) => {
    addToast({
      title: 'Coming Soon',
      description: 'Image download feature coming soon',
      color: 'default',
    });
  };

  const handleRefundSuccess = (data: any) => {
    if (data.sale && sale) {
      updateSale(sale.id, data.sale);
    }
  };

  const handlePaymentUpdate = async () => {
    await fetchSales();
  };

  const showSkeleton = !sale && (isInitialLoading || isFetching);

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

  if (notFound || !sale) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-full p-6">
          <FileX className="text-danger-500" size={48} />
        </div>
        <h3 className="text-xl font-semibold">Sale Not Found</h3>
        <p className="text-default-500 text-center max-w-md">
          The sale <span className="font-mono text-sm">{receiptNumber}</span>
          {` doesn't exist or may have been deleted.`}
        </p>
        <Button
          color="primary"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push('/dashboard/sales')}
        >
          Back to Sales
        </Button>
      </div>
    );
  }

  const canRefund =
    sale.amountPaid > 0 &&
    (sale.status === 'PAID' || sale.status === 'PARTIALLY_PAID') &&
    !sale.refundAmount;
  const refunded =
    sale.status === 'REFUNDED' || sale.status === 'PARTIALLY_REFUNDED';
  return (
    <div className="max-w-7xl mx-auto">
      <SaleHeader
        onDownloadImage={handleDownloadImage}
        onDownloadPDF={handleDownloadPDF}
        onShare={handleShare}
      />

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 mt-6 lg:mt-0">
        <div className="lg:col-span-2 space-y-6">
          <SaleInfoSection sale={sale} />
          <SaleItemsSection sale={sale} />

          {sale.payments && sale.payments.length > 0 && (
            <div className="lg:hidden">
              <SalePaymentSection
                sale={sale}
                onPaymentUpdate={handlePaymentUpdate}
              />
            </div>
          )}
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          <SaleCustomerSection sale={sale} />

          <div className="hidden lg:block">
            <SalePaymentSection
              sale={sale}
              onPaymentUpdate={handlePaymentUpdate}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {!refunded && <AddSalePayment sale={sale} />}
            {canRefund && (
              <RefundModal
                amountPaid={sale.amountPaid}
                itemId={sale.id}
                itemNumber={sale.receiptNumber}
                itemType="sale"
                totalAmount={sale.totalAmount}
                onSuccess={handleRefundSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
