'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, addToast } from '@heroui/react';
import { ArrowLeft, FileX } from '@phosphor-icons/react';
import { useSession } from 'next-auth/react';

import { useInvoiceStore } from '@/store/invoiceStore';
import useInvoiceDownload from '@/lib/invoiceDownloadHelper';
import InvoiceHeader from '@/components/dashboard/invoices/single/InvoiceHeader';
import InvoiceInfoSection from '@/components/dashboard/invoices/single/InvoiceInfoSection';
import InvoiceCustomerSection from '@/components/dashboard/invoices/single/InvoiceCustomerSection';
import InvoiceItemsSection from '@/components/dashboard/invoices/single/InvoiceItemsSection';
import InvoicePaymentSection from '@/components/dashboard/invoices/single/InvoicePaymentSection';
import ConvertToSales from '@/components/dashboard/invoices/single/ConvertToSales';

export default function SingleInvoice() {
  const params = useParams();
  const router = useRouter();
  const { data } = useSession();

  const businessInfo = {
    name: data?.user.onboarding?.businessName || data?.user.name || '',
    email: data?.user.email || '',
    phone: data?.user.onboarding?.phoneNumber || '',
  };

  const invoiceNumber = params.id as string;

  // ✅ Subscribe to store updates directly
  const invoice = useInvoiceStore(state =>
    state.allInvoices.find(inv => inv.invoiceNumber === invoiceNumber)
  );
  const { fetchInvoices, isInitialLoading } = useInvoiceStore();
  const { downloadAsPDF, downloadAsImage } = useInvoiceDownload();

  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const loadInvoice = async () => {
      // Check if invoice exists in cache
      const cachedInvoice = useInvoiceStore
        .getState()
        .allInvoices.find(inv => inv.invoiceNumber === invoiceNumber);

      if (cachedInvoice) {
        setNotFound(false);

        // Fetch fresh data in background
        setIsFetching(true);
        await fetchInvoices();
        setIsFetching(false);

        return;
      }

      // No cache, fetch from API
      setIsFetching(true);
      try {
        await fetchInvoices();

        const fetchedInvoice = useInvoiceStore
          .getState()
          .allInvoices.find(inv => inv.invoiceNumber === invoiceNumber);

        if (!fetchedInvoice) {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching invoices:', error);
        setNotFound(true);
      } finally {
        setIsFetching(false);
      }
    };

    loadInvoice();
  }, [invoiceNumber, fetchInvoices]);

  const handleShare = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast({
        title: 'Link Copied',
        description: 'Invoice link copied to clipboard',
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
    if (!invoice) return;

    setIsDownloading(true);
    try {
      await downloadAsPDF(invoice, businessInfo, {
        fileName: `invoice-${invoice.invoiceNumber}`,
        orientation: 'portrait',
      });
      addToast({
        title: 'Success',
        description: 'Invoice downloaded as PDF',
        color: 'success',
      });
    } catch (error) {
      console.error('Download error:', error);
      addToast({
        title: 'Error',
        description: 'Failed to download PDF',
        color: 'danger',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadImage = async (
    layoutStyle: 'professional' | 'default'
  ) => {
    if (!invoice) return;

    setIsDownloading(true);
    try {
      await downloadAsImage(invoice, businessInfo, {
        fileName: `invoice-${invoice.invoiceNumber}`,
      });
      addToast({
        title: 'Success',
        description: 'Invoice downloaded as image',
        color: 'success',
      });
    } catch (error) {
      console.error('Download error:', error);
      addToast({
        title: 'Error',
        description: 'Failed to download image',
        color: 'danger',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // ✅ Show skeleton only when NO cached data and fetching
  const showSkeleton = !invoice && (isInitialLoading || isFetching);

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

  if (notFound || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-full p-6">
          <FileX className="text-danger-500" size={48} />
        </div>
        <h3 className="text-xl font-semibold">Invoice Not Found</h3>
        <p className="text-default-500 text-center max-w-md">
          The invoice <span className="font-mono text-sm">{invoiceNumber}</span>{' '}
          doesn't exist or may have been deleted.
        </p>
        <Button
          color="primary"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push('/dashboard/invoice')}
        >
          Back to Invoices
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <InvoiceHeader
        isDownloading={isDownloading}
        onDownloadImage={handleDownloadImage}
        onDownloadPDF={handleDownloadPDF}
        onShare={handleShare}
      />

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 mt-6 lg:mt-0">
        <div className="lg:col-span-2 space-y-6">
          <InvoiceInfoSection invoice={invoice} />
          <InvoiceItemsSection invoice={invoice} />

          {invoice.sale && (
            <div className="lg:hidden">
              <InvoicePaymentSection invoice={invoice} />
            </div>
          )}
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          <InvoiceCustomerSection invoice={invoice} />

          <div className="hidden lg:block">
            <InvoicePaymentSection invoice={invoice} />
          </div>

          <ConvertToSales invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
