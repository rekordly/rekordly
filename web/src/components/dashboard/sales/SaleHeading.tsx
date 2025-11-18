'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';

export function SaleHeading() {
  const { control } = useFormContext();

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              Sale Details
            </h4>
          </div>
          <Divider />

          <div className="grid grid-cols-1 gap-4">
            <TextInput
              isRequired
              control={control}
              label="Sale Title"
              name="title"
              placeholder="e.g., Sale of Web Development Services"
            />
            <TextInput
              control={control}
              label="Sale Description (optional)"
              name="description"
              placeholder="Add any notes or payment instructions..."
            />
            <TextInput
              control={control}
              label="Sale Date"
              name="saleDate"
              placeholder="Select sale date"
              type="datetime-local"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
