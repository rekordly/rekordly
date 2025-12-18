'use client';

import { Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';

import { formatCurrency } from '@/lib/fn';
import { OtherCostType } from '@/types/quotations';

interface CostItemProps {
  cost: OtherCostType;
  onRemove: (id: number) => void;
}

export function CostItem({ cost, onRemove }: CostItemProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-default-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{cost.description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="text-sm font-semibold">{formatCurrency(cost.amount)}</p>
        <Button
          isIconOnly
          color="danger"
          size="sm"
          variant="light"
          onPress={() => onRemove(cost.id)}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}
