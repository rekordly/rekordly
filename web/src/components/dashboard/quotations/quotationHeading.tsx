'use client';

import { Card, CardBody } from '@heroui/card';
import { useFormContext } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';

export function QuotationHeading() {
  const { control } = useFormContext();

  return (
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0">
        <div className="space-y-3 py-2">
          <div className="space-y-2 px-2">
            <h4 className="text-base font-semibold text-foreground">
              Quotation Details
            </h4>
          </div>

          <TextInput
            isRequired
            control={control}
            label="Quotation Title"
            name="title"
            placeholder="e.g., Quotation for Web Development Services"
          />

          <TextInput
            control={control}
            label="Description (optional)"
            name="description"
            placeholder="Add any notes or payment instructions..."
          />

          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              control={control}
              label="Issue Date"
              name="issueDate"
              type="date"
            />

            <TextInput
              control={control}
              label="Valid Until (optional)"
              name="validUntil"
              type="date"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
