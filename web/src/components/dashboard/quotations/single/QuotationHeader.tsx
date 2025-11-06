'use client';

import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import {
  ArrowLeft,
  ShareNetwork,
  DownloadSimple,
  FilePdf,
  FileImage,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';

interface QuotationHeaderProps {
  onShare?: () => void;
  onDownloadPDF?: (layoutStyle: 'professional' | 'default') => void;
  onDownloadImage?: (layoutStyle: 'professional' | 'default') => void;
  isDownloading?: boolean;
}

export default function QuotationHeader({
  onShare,
  onDownloadPDF,
  onDownloadImage,
  isDownloading = false,
}: QuotationHeaderProps) {
  const router = useRouter();

  return (
    <div
      className="mb-6 -mt-2 flex items-center justify-between"
      data-section="header"
    >
      <Button
        className="text-default-600"
        startContent={<ArrowLeft size={20} />}
        variant="light"
        onPress={() => router.push('/dashboard/quotations')}
      >
        Back
      </Button>

      <div className="flex gap-2">
        <Button
          isIconOnly
          className="border-default-200"
          title="Copy quotation link"
          variant="bordered"
          onPress={onShare}
        >
          <ShareNetwork size={20} />
        </Button>

        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button
              color="primary"
              isDisabled={isDownloading}
              isLoading={isDownloading}
              startContent={<DownloadSimple size={20} />}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Download options">
            <DropdownItem
              key="pdf"
              isDisabled={isDownloading}
              startContent={<FilePdf size={20} weight="duotone" />}
              onPress={() => onDownloadPDF?.('professional')}
            >
              Download as PDF
            </DropdownItem>
            <DropdownItem
              key="image"
              isDisabled={isDownloading}
              startContent={<FileImage size={20} weight="duotone" />}
              onPress={() => onDownloadImage?.('professional')}
            >
              Download as Image
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}
