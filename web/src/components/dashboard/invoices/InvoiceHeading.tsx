'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';

export function InvoiceHeading() {
  const { control } = useFormContext();

  return (
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-foreground">
              Invoice Details
            </h4>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              isRequired
              control={control}
              label="Invoice Title"
              name="invoiceTitle"
              placeholder="e.g., Quotation for Web Development Services"
            />

            <TextInput
              control={control}
              label="Due Date (optional)"
              name="dueDate"
              placeholder="Select due date"
              type="datetime-local"
            />
          </div>

          <div className="grid grid-cols-1">
            <TextInput
              control={control}
              label="Invoice Description (optional)"
              name="invoiceDescription"
              placeholder="Add any notes or payment instructions..."
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
