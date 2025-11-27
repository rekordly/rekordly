'use client';

import {
  Button,
  Chip,
  Skeleton,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { ArrowLeft, Download, Share2, MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { formatCurrency, formatDate } from '@/lib/fn';
import {
  ShareNetwork,
  DownloadSimple,
  FilePdf,
  FileImage,
} from '@phosphor-icons/react';

interface PurchaseHeaderProps {
  onShare?: () => void;
  onDownloadPDF?: (layoutStyle: 'professional' | 'default') => void;
  onDownloadImage?: (layoutStyle: 'professional' | 'default') => void;
  isDownloading?: boolean;
}

export function PurchaseHeader({
  onDownloadPDF,
  onDownloadImage,
  onShare,
  isDownloading = false,
}: PurchaseHeaderProps) {
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
        onPress={() => router.push('/dashboard/purchases')}
      >
        Back
      </Button>

      <div className="flex gap-2">
        <Button
          isIconOnly
          className="border-default-200"
          title="Copy sale link"
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
