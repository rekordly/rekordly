import { renderToStaticMarkup } from 'react-dom/server';
import {
  downloadAsImage,
  downloadAsPDF,
  DownloadConfig,
} from '@/lib/downloadUtils';
import { InvoiceDownloadLayout } from '@/components/dashboard/invoices/InvoiceDownloadLayout';
import { Invoice } from '@/types/invoices';

interface BusinessInfo {
  name: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface InvoiceDownloadOptions {
  invoice: Invoice;
  businessInfo?: BusinessInfo;
}

const createInvoiceElement = (options: InvoiceDownloadOptions): HTMLElement => {
  const { invoice, businessInfo } = options;

  // Create container
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    InvoiceDownloadLayout({ invoice, businessInfo })
  );

  // Add to DOM temporarily (required for rendering)
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.top = '0';
  document.body.appendChild(container);

  return container.firstElementChild as HTMLElement;
};

/**
 * Download invoice as PNG image
 */
export const downloadInvoiceAsImage = async (
  options: InvoiceDownloadOptions,
  fileName?: string
): Promise<void> => {
  const element = createInvoiceElement(options);

  try {
    const config: DownloadConfig = {
      scale: 3,
      backgroundColor: '#ffffff',
      width: 800,
    };

    await downloadAsImage(
      element,
      fileName || `invoice-${options.invoice.invoiceNumber}`,
      config
    );
  } finally {
    // Cleanup
    if (element.parentNode) {
      document.body.removeChild(element.parentNode);
    }
  }
};

/**
 * Download invoice as PDF
 * Creates clean PDFs with good quality and reasonable file size
 */
export const downloadInvoiceAsPDF = async (
  options: InvoiceDownloadOptions,
  fileName?: string,
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<void> => {
  const element = createInvoiceElement(options);

  try {
    const config: DownloadConfig = {
      scale: 2, // Good balance between quality and file size
      backgroundColor: '#ffffff',
      width: 800,
    };

    await downloadAsPDF(
      element,
      fileName || `invoice-${options.invoice.invoiceNumber}`,
      orientation,
      config
    );
  } finally {
    // Cleanup
    if (element.parentNode) {
      document.body.removeChild(element.parentNode);
    }
  }
};

/**
 * Hook-friendly version that renders the layout in a hidden container
 */
export const useInvoiceDownload = () => {
  const downloadAsImageWithLayout = async (
    invoice: Invoice,
    businessInfo?: BusinessInfo,
    options?: {
      fileName?: string;
    }
  ) => {
    await downloadInvoiceAsImage(
      {
        invoice,
        businessInfo,
      },
      options?.fileName
    );
  };

  const downloadAsPDFWithLayout = async (
    invoice: Invoice,
    businessInfo?: BusinessInfo,
    options?: {
      fileName?: string;
      orientation?: 'portrait' | 'landscape';
    }
  ) => {
    await downloadInvoiceAsPDF(
      {
        invoice,
        businessInfo,
      },
      options?.fileName,
      options?.orientation
    );
  };

  return {
    downloadAsImage: downloadAsImageWithLayout,
    downloadAsPDF: downloadAsPDFWithLayout,
  };
};

export default useInvoiceDownload;
