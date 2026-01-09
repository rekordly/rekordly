'use client';

import { Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';

import { formatCurrency } from '@/lib/fn';
import { QuotationLineItemType } from '@/types/quotations';

interface LineItemProps {
  item: QuotationLineItemType;
  onRemove: (id: string) => void;
}

export function LineItemDisplay({ item, onRemove }: LineItemProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-default-500 uppercase">
            {item.type}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {item.name}
          </span>
        </div>
        {item.description && (
          <p className="text-xs text-default-400 mt-0.5 truncate">
            {item.description}
          </p>
        )}
        <div className="text-xs text-default-500 mt-1">
          {item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold">
          {formatCurrency(item.amount)}
        </span>
        <Button
          isIconOnly
          color="danger"
          size="sm"
          type="button"
          variant="light"
          onPress={() => item.id && onRemove(item.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
