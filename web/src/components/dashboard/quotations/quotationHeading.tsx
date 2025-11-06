'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';

export function QuotationHeading() {
  const { control } = useFormContext();

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              Quotation Details
            </h4>
          </div>
          <Divider />

          <div className="grid grid-cols-1 gap-4">
            <TextInput
              isRequired
              control={control}
              label="Quotation Title"
              name="quotationTitle"
              placeholder="e.g., Quotation for Web Development Services"
            />
            <TextInput
              control={control}
              label="Quotation Description (optional)"
              name="quotationDescription"
              placeholder="Add any notes or payment instructions..."
            />
            <div className="grid md:grid-cols-2 gap-4">
              <TextInput
                control={control}
                label="Issue Date"
                name="issueDate"
                placeholder="Select due date"
                type="date"
              />

              <TextInput
                control={control}
                label="Valid Until (optional)"
                name="validUntil"
                placeholder="Select due date"
                type="datetime-local"
              />
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
