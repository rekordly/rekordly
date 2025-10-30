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

interface InvoiceHeaderProps {
  onShare?: () => void;
  onDownloadPDF?: (layoutStyle: 'professional' | 'default') => void;
  onDownloadImage?: (layoutStyle: 'professional' | 'default') => void;
  isDownloading?: boolean;
}

export default function InvoiceHeader({
  onShare,
  onDownloadPDF,
  onDownloadImage,
  isDownloading = false,
}: InvoiceHeaderProps) {
  const router = useRouter();

  return (
    <div
      className="mb-6 -mt-2 flex items-center justify-between"
      data-section="header"
    >
      <Button
        variant="light"
        startContent={<ArrowLeft size={20} />}
        onPress={() => router.push('/dashboard/invoice')}
        className="text-default-600"
      >
        Back
      </Button>

      <div className="flex gap-2">
        <Button
          variant="bordered"
          isIconOnly
          onPress={onShare}
          className="border-default-200"
          title="Copy invoice link"
        >
          <ShareNetwork size={20} />
        </Button>

        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button
              color="primary"
              startContent={<DownloadSimple size={20} />}
              isLoading={isDownloading}
              isDisabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Download options">
            <DropdownItem
              key="pdf"
              startContent={<FilePdf size={20} weight="duotone" />}
              onPress={() => onDownloadPDF?.('professional')}
              isDisabled={isDownloading}
            >
              Download as PDF
            </DropdownItem>
            <DropdownItem
              key="image"
              startContent={<FileImage size={20} weight="duotone" />}
              onPress={() => onDownloadImage?.('professional')}
              isDisabled={isDownloading}
            >
              Download as Image
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}
