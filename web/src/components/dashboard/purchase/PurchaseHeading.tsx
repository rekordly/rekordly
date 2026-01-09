'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';
import { PurchaseType } from '@prisma/client';
import { Package, ShoppingCart, Briefcase, User } from 'lucide-react';

import { TextInput } from '@/components/ui/Input';

interface PurchaseHeadingProps {
  purchaseType: PurchaseType;
}

export function PurchaseHeading({ purchaseType }: PurchaseHeadingProps) {
  const { control } = useFormContext();

  const getPurchaseTypeInfo = () => {
    switch (purchaseType) {
      case 'INVENTORY_RESTOCK':
        return {
          icon: <Package className="w-4 h-4" />,
          label: 'Inventory Restock',
          color: 'primary' as const,
          description: 'Purchase of inventory items for resale or production',
        };
      case 'BUSINESS_EXPENSE':
        return {
          icon: <ShoppingCart className="w-4 h-4" />,
          label: 'Business Expense',
          color: 'secondary' as const,
          description: 'Operational expenses for business activities',
        };
      case 'ASSET_PURCHASE':
        return {
          icon: <Briefcase className="w-4 h-4" />,
          label: 'Asset Purchase',
          color: 'success' as const,
          description:
            'Purchase of long-term assets (equipment, vehicles, etc.)',
        };
      case 'PERSONAL_EXPENSE':
        return {
          icon: <User className="w-4 h-4" />,
          label: 'Personal Expense',
          color: 'warning' as const,
          description: 'Personal expenses paid through business',
        };
      default:
        return {
          icon: <Package className="w-4 h-4" />,
          label: 'Purchase',
          color: 'default' as const,
          description: '',
        };
    }
  };

  const typeInfo = getPurchaseTypeInfo();

  return (
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-foreground">
              Purchase Details
            </h4>
            <Chip
              color={typeInfo.color}
              size="sm"
              variant="flat"
              startContent={typeInfo.icon}
            >
              {typeInfo.label}
            </Chip>
          </div>

          {typeInfo.description && (
            <p className="text-xs text-default-500 bg-default-50 p-2 rounded-lg -mt-1">
              {typeInfo.description}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4">
            <TextInput
              isRequired
              control={control}
              label="Purchase Title/Description"
              name="title"
              placeholder={`e.g., ${
                purchaseType === 'INVENTORY_RESTOCK'
                  ? 'Raw Materials Order - January 2024'
                  : purchaseType === 'BUSINESS_EXPENSE'
                    ? 'Office Supplies Purchase'
                    : purchaseType === 'ASSET_PURCHASE'
                      ? 'New Delivery Van'
                      : 'Owner Drawing'
              }`}
              description="Brief description of what this purchase is for"
            />

            <TextInput
              control={control}
              label="Additional Notes"
              name="description"
              placeholder="Any additional details about this purchase..."
              description="Optional: Add any extra information or special instructions"
            />

            <TextInput
              isRequired
              control={control}
              label="Purchase Date"
              name="purchaseDate"
              type="date"
              description="The date when the purchase was made or ordered"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
