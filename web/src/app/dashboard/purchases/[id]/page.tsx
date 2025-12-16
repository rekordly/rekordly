'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, addToast } from '@heroui/react';
import { ArrowLeft, FileX } from 'lucide-react';

import { usePurchaseStore } from '@/store/purchase-store';
import { PurchaseHeader } from '@/components/dashboard/purchase/single/PurchaseHeader';
import { PurchaseInfoSection } from '@/components/dashboard/purchase/single/PurchaseInfoSection';
import { PurchaseItemsSection } from '@/components/dashboard/purchase/single/PurchaseItemsSection';
import { PurchaseVendorSection } from '@/components/dashboard/purchase/single/PurchaseVendorSection';
import { RefundModal } from '@/components/modals/RefundModal';
import { PaymentSection } from '@/components/dashboard/PaymentSection';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { CustomerInfoSection } from '@/components/dashboard/CustomerInfoSection';
import { RefundInfoSection } from '@/components/dashboard/RefundInfoSection';
import { EntityHeader } from '@/components/dashboard/EntityHeader';

export default function SinglePurchase() {
  const params = useParams();
  const router = useRouter();

  const purchaseNumber = params.id as string;

  const purchase = usePurchaseStore(state =>
    state.allPurchases.find(p => p.purchaseNumber === purchaseNumber)
  );
  const { fetchPurchases, isInitialLoading, updatePurchase } =
    usePurchaseStore();

  const [notFound, setNotFound] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const loadPurchase = async () => {
      const cachedPurchase = usePurchaseStore
        .getState()
        .allPurchases.find(p => p.purchaseNumber === purchaseNumber);

      if (cachedPurchase) {
        setNotFound(false);
        setIsFetching(true);
        await fetchPurchases();
        setIsFetching(false);
        return;
      }

      setIsFetching(true);
      try {
        await fetchPurchases();

        const fetchedPurchase = usePurchaseStore
          .getState()
          .allPurchases.find(p => p.purchaseNumber === purchaseNumber);

        if (!fetchedPurchase) {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching purchases:', error);
        setNotFound(true);
      } finally {
        setIsFetching(false);
      }
    };

    loadPurchase();
  }, [purchaseNumber, fetchPurchases]);

  const handleShare = async () => {
    if (!purchase) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast({
        title: 'Link Copied',
        description: 'Purchase link copied to clipboard',
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
    if (data.purchase && purchase) {
      updatePurchase(purchase.id, data.purchase);
    }
  };

  // Updated handler for payment success
  const handlePaymentSuccess = (data: any) => {
    // Update the purchase in the store with the new data
    if (data.purchase && purchase) {
      updatePurchase(purchase.id, data.purchase);
    }

    // Alternative: if the API returns entity under a generic key
    if (data.entity && purchase) {
      updatePurchase(purchase.id, data.entity);
    }
  };

  const handlePaymentUpdate = () => {
    // This just triggers a refresh - the actual update happens in handlePaymentSuccess
  };

  const showSkeleton = !purchase && (isInitialLoading || isFetching);

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

  if (notFound || !purchase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-full p-6">
          <FileX className="text-danger-500" size={48} />
        </div>
        <h3 className="text-xl font-semibold">Purchase Not Found</h3>
        <p className="text-default-500 text-center max-w-md">
          The purchase{' '}
          <span className="font-mono text-sm">{purchaseNumber}</span>
          {` doesn't exist or may have been deleted.`}
        </p>
        <Button
          color="primary"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push('/dashboard/purchases')}
        >
          Back to Purchases
        </Button>
      </div>
    );
  }

  const canRefund =
    purchase.amountPaid > 0 &&
    (purchase.status === 'PAID' || purchase.status === 'PARTIALLY_PAID') &&
    !purchase.refundAmount;
  const refunded =
    purchase.status === 'REFUNDED' || purchase.status === 'PARTIALLY_REFUNDED';

  return (
    <div className="max-w-7xl mx-auto">
      <EntityHeader
        entity="purchases"
        onShare={handleShare}
        onDownloadPDF={handleDownloadPDF}
        onDownloadImage={handleDownloadImage}
      />
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 mt-6 lg:mt-0">
        <div className="lg:col-span-2 space-y-6">
          <PurchaseInfoSection purchase={purchase} />
          <RefundInfoSection
            refundAmount={purchase.refundAmount || 0}
            refundDate={purchase.refundDate}
            refundReason={purchase.refundReason}
            status={purchase.status}
          />
          <PurchaseItemsSection purchase={purchase} />

          {purchase.payments && purchase.payments.length > 0 && (
            <div className="lg:hidden">
              <PaymentSection
                totalAmount={purchase.totalAmount}
                amountPaid={purchase.amountPaid}
                balance={purchase.balance}
                payments={purchase.payments}
                showActions={true}
                onPaymentUpdate={handlePaymentUpdate}
                entityType="purchase"
                entityId={purchase.id}
              />
            </div>
          )}
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          {/* <PurchaseVendorSection purchase={purchase} /> */}
          <CustomerInfoSection
            name={purchase.customer?.name || purchase.vendorName}
            email={purchase.customer?.email || purchase.vendorEmail}
            phone={purchase.customer?.phone || purchase.vendorPhone}
            // title="Billed To"
          />

          <div className="hidden lg:block">
            <PaymentSection
              totalAmount={purchase.totalAmount}
              amountPaid={purchase.amountPaid}
              balance={purchase.balance}
              payments={purchase.payments}
              showActions={true}
              onPaymentUpdate={handlePaymentUpdate}
              entityType="purchase"
              entityId={purchase.id}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {purchase.status !== 'PAID' && (
              <AddPaymentModal
                entityType="purchase"
                entityId={purchase.id}
                entityNumber={purchase.purchaseNumber}
                totalAmount={purchase.totalAmount}
                amountPaid={purchase.amountPaid}
                balance={purchase.balance}
                onSuccess={handlePaymentSuccess}
              />
            )}
            {canRefund && (
              <RefundModal
                amountPaid={purchase.amountPaid}
                itemId={purchase.id}
                itemNumber={purchase.purchaseNumber}
                itemType="purchase"
                totalAmount={purchase.totalAmount}
                onSuccess={handleRefundSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
