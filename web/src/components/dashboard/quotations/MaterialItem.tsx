'use client';

import { Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';

import { formatCurrency } from '@/lib/fn';
import { MaterialItemType } from '@/types/quotations';

interface MaterialItemProps {
  material: MaterialItemType;
  onRemove: (id: number) => void;
}

export function MaterialItem({ material, onRemove }: MaterialItemProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-default-500">
            #{material.id}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {material.name}
          </span>
        </div>
        <div className="text-xs text-default-500 mt-1">
          {material.qty} × {formatCurrency(material.unitPrice)}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold">
          {formatCurrency(material.total)}
        </span>
        <Button
          isIconOnly
          color="danger"
          size="sm"
          type="button"
          variant="light"
          onPress={() => onRemove(material.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
