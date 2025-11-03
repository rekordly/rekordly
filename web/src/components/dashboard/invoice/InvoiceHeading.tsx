'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';
import { TextInput } from '@/components/ui/Input';

export function InvoiceHeading() {
  const { control } = useFormContext();

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              Invoice Details
            </h4>
          </div>
          <Divider />

          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              name="invoiceTitle"
              control={control}
              label="Invoice Title"
              placeholder="e.g., Quotation for Web Development Services"
              isRequired
            />

            <TextInput
              name="dueDate"
              control={control}
              label="Due Date (optional)"
              placeholder="Select due date"
              type="datetime-local"
            />
          </div>

          <div className="grid grid-cols-1">
            <TextInput
              name="invoiceDescription"
              control={control}
              label="Invoice Description (optional)"
              placeholder="Add any notes or payment instructions..."
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
