'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';

export function PurchaseHeading() {
  const { control } = useFormContext();

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-sm font-semibold text-foreground">
              Purchase Details
            </h4>
          </div>
          <Divider />

          <div className="grid grid-cols-1 gap-4">
            <TextInput
              isRequired
              control={control}
              label="Purchase Title/Description"
              name="title"
              placeholder="e.g., Office Supplies Purchase, Raw Materials Order"
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
