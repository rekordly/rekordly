import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Convert modern CSS colors (oklab, oklch) to RGB
 */
const convertModernColors = (element: HTMLElement): void => {
  const allElements = [element, ...Array.from(element.querySelectorAll('*'))];

  allElements.forEach(el => {
    if (!(el instanceof HTMLElement)) return;

    const computedStyle = window.getComputedStyle(el);
    const colorProps = [
      'color',
      'backgroundColor',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'textDecorationColor',
    ];

    colorProps.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);

      if (
        value &&
        (value.includes('oklab') ||
          value.includes('oklch') ||
          value.includes('color('))
      ) {
        const tempDiv = document.createElement('div');

        tempDiv.style.cssText = `position: absolute; visibility: hidden; ${prop}: ${value};`;
        document.body.appendChild(tempDiv);
        const rgbValue = window
          .getComputedStyle(tempDiv)
          .getPropertyValue(prop);

        document.body.removeChild(tempDiv);

        if (rgbValue && rgbValue !== value) {
          el.style.setProperty(prop, rgbValue, 'important');
        }
      }
    });

    const bgImage = computedStyle.backgroundImage;

    if (bgImage && (bgImage.includes('oklab') || bgImage.includes('oklch'))) {
      el.style.backgroundImage = bgImage.replace(
        /ok(lab|lch)\([^)]+\)/g,
        match => {
          const tempDiv = document.createElement('div');

          tempDiv.style.cssText = `position: absolute; visibility: hidden; color: ${match};`;
          document.body.appendChild(tempDiv);
          const rgb = window.getComputedStyle(tempDiv).color;

          document.body.removeChild(tempDiv);

          return rgb;
        }
      );
    }
  });
};

export interface DownloadConfig {
  scale?: number;
  backgroundColor?: string;
  width?: number;
}

/**
 * Prepare element for download by creating a clean clone
 */
export const prepareElementForDownload = (
  element: HTMLElement,
  config: DownloadConfig = {}
): { container: HTMLElement; cleanup: () => void } => {
  const { backgroundColor = '#ffffff', width = 800 } = config;

  const container = document.createElement('div');

  container.style.cssText = `
    position: absolute;
    left: -99999px;
    top: 0;
    width: ${width}px;
    background-color: ${backgroundColor};
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const clone = element.cloneNode(true) as HTMLElement;

  container.appendChild(clone);
  document.body.appendChild(container);

  setTimeout(() => convertModernColors(container), 0);

  return {
    container,
    cleanup: () => {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    },
  };
};

/**
 * Generate canvas from element
 */
const generateCanvas = async (
  container: HTMLElement,
  config: DownloadConfig = {}
): Promise<HTMLCanvasElement> => {
  const { scale = 2, backgroundColor = '#ffffff', width = 800 } = config;

  // Wait for styles/fonts and color conversion to apply.
  await new Promise(resolve => setTimeout(resolve, 300));
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = await html2canvas(container, {
    // Keep the bitmap bounded. Very large canvases produce invalid PDF
    // coordinates in jsPDF and are unnecessary for a receipt.
    scale: Math.min(Math.max(scale, 1), 2),
    useCORS: true,
    logging: false,
    backgroundColor,
    windowWidth: width,
    allowTaint: true,
    foreignObjectRendering: false,
    imageTimeout: 15000,
    removeContainer: false,
  });

  if (!canvas.width || !canvas.height || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height)) {
    throw new Error('Unable to render document for download');
  }

  return canvas;
};

/**
 * Download as PNG image
 */
export const downloadAsImage = async (
  element: HTMLElement,
  fileName: string = 'document',
  config: DownloadConfig = {}
): Promise<void> => {
  let cleanup: (() => void) | null = null;

  try {
    const { container, cleanup: cleanupFn } = prepareElementForDownload(
      element,
      config
    );

    cleanup = cleanupFn;

    const canvas = await generateCanvas(container, { ...config, scale: 2 });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => {
        if (value) resolve(value);
        else reject(new Error('Unable to encode document image'));
      }, 'image/png');
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Error downloading image:', error);
    throw error;
  } finally {
    if (cleanup) cleanup();
  }
};

/**
 * Download as PDF - Simple and reliable method with multi-page support
 * Uses canvas to ensure everything renders correctly
 * PDF format: A4 (210mm x 297mm)
 */
export const downloadAsPDF = async (
  element: HTMLElement,
  fileName: string = 'document',
  orientation: 'portrait' | 'landscape' = 'portrait',
  config: DownloadConfig = {}
): Promise<void> => {
  let cleanup: (() => void) | null = null;

  try {
    const { container, cleanup: cleanupFn } = prepareElementForDownload(
      element,
      config
    );

    cleanup = cleanupFn;

    // Generate high-quality canvas
    const canvas = await generateCanvas(container, { ...config, scale: 2 });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // A4 dimensions in mm
    const pdfWidth = orientation === 'portrait' ? 210 : 297;
    const pdfHeight = orientation === 'portrait' ? 297 : 210;

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    // Calculate scaling to fit width (with margins)
    const margin = 10; // 10mm margin on each side
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2;

    const ratio = availableWidth / imgWidth;
    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;

    if (![ratio, scaledWidth, scaledHeight].every(Number.isFinite) || ratio <= 0) {
      throw new Error('Unable to calculate PDF dimensions');
    }

    // Check if content fits on one page
    if (scaledHeight <= availableHeight) {
      // Single page - center vertically
      const y = (pdfHeight - scaledHeight) / 2;

      pdf.addImage(imgData, 'JPEG', margin, y, scaledWidth, scaledHeight);
    } else {
      // Multi-page - split content
      let yOffset = 0;
      let pageNumber = 0;

      while (yOffset < imgHeight) {
        if (pageNumber > 0) {
          pdf.addPage();
        }

        // Calculate slice of image for this page
        const sliceHeight = availableHeight / ratio;
        const remainingHeight = imgHeight - yOffset;
        const currentSliceHeight = Math.min(sliceHeight, remainingHeight);

        // Create canvas for this page slice
        const pageCanvas = document.createElement('canvas');

        pageCanvas.width = imgWidth;
        pageCanvas.height = Math.max(1, Math.floor(currentSliceHeight));

        const pageCtx = pageCanvas.getContext('2d');

        if (pageCtx) {
          pageCtx.drawImage(
            canvas,
            0,
            yOffset,
            imgWidth,
            currentSliceHeight,
            0,
            0,
            imgWidth,
            currentSliceHeight
          );

          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
          const pageScaledHeight = currentSliceHeight * ratio;

          if (!Number.isFinite(pageScaledHeight) || pageScaledHeight <= 0) {
            throw new Error('Unable to calculate PDF page dimensions');
          }
          pdf.addImage(pageImgData, 'JPEG', margin, margin, scaledWidth, pageScaledHeight);
        }

        yOffset += pageCanvas.height;
        pageNumber++;
      }
    }

    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  } finally {
    if (cleanup) cleanup();
  }
};

/**
 * Share as image (mobile-friendly)
 */
export const shareAsImage = async (
  element: HTMLElement,
  title: string = 'Document',
  config: DownloadConfig = {}
): Promise<void> => {
  let cleanup: (() => void) | null = null;

  try {
    if (!navigator.share) {
      throw new Error('Web Share API not supported');
    }

    const { container, cleanup: cleanupFn } = prepareElementForDownload(
      element,
      config
    );

    cleanup = cleanupFn;

    const canvas = await generateCanvas(container, config);

    const blob = await new Promise<Blob>(resolve => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
      }, 'image/png');
    });

    const file = new File([blob], `${title}.png`, { type: 'image/png' });

    await navigator.share({
      title,
      files: [file],
    });
  } catch (error) {
    console.error('Error sharing image:', error);
    throw error;
  } finally {
    if (cleanup) cleanup();
  }
};
