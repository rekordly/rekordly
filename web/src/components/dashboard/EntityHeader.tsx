'use client';

import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  ShareNetwork,
  DownloadSimple,
  FilePdf,
  FileImage,
} from '@phosphor-icons/react';

interface EntityHeaderProps {
  entity: 'sales' | 'purchases' | 'quotations' | 'loans' | 'invoices';
  onShare?: () => void;
  onDownloadPDF?: (layoutStyle: 'professional' | 'default') => void;
  onDownloadImage?: (layoutStyle: 'professional' | 'default') => void;
  isDownloading?: boolean;
  backPath?: string;
}

export function EntityHeader({
  entity,
  onDownloadPDF,
  onDownloadImage,
  onShare,
  isDownloading = false,
  backPath,
}: EntityHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    router.push(backPath || `/dashboard/${entity}`);
  };

  // Create dropdown items based on available handlers
  const dropdownItems = [];

  if (onDownloadPDF) {
    dropdownItems.push(
      <DropdownItem
        key="pdf"
        isDisabled={isDownloading}
        startContent={<FilePdf size={20} weight="duotone" />}
        onPress={() => onDownloadPDF('professional')}
      >
        Download as PDF
      </DropdownItem>
    );
  }

  if (onDownloadImage) {
    dropdownItems.push(
      <DropdownItem
        key="image"
        isDisabled={isDownloading}
        startContent={<FileImage size={20} weight="duotone" />}
        onPress={() => onDownloadImage('professional')}
      >
        Download as Image
      </DropdownItem>
    );
  }

  const showDownloadMenu = dropdownItems.length > 0;

  return (
    <div
      className="mb-6 -mt-2 flex items-center justify-between"
      data-entity={entity}
    >
      <Button
        className="text-default-600"
        startContent={<ArrowLeft size={20} />}
        variant="light"
        onPress={handleBack}
      >
        Back
      </Button>

      <div className="flex gap-2">
        {onShare && (
          <Button
            isIconOnly
            className="border-default-200"
            title={`Share ${entity}`}
            variant="bordered"
            onPress={onShare}
          >
            <ShareNetwork size={20} />
          </Button>
        )}

        {showDownloadMenu && (
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
            <DropdownMenu aria-label={`Download ${entity} options`}>
              {dropdownItems}
            </DropdownMenu>
          </Dropdown>
        )}
      </div>
    </div>
  );
}
