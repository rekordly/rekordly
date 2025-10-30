'use client';

import { Card, CardBody, CardHeader } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';
import { AutocompleteInput, TextInput } from '@/components/ui/Input';
import { CustomerType } from '@/types/invoice';
import { useState } from 'react';

interface CustomerDetailsProps {
  customers: CustomerType[];
}

export function CustomerDetails({ customers }: CustomerDetailsProps) {
  const { control, setValue, watch } = useFormContext();
  const [isCustomerSelected, setIsCustomerSelected] = useState(false);

  // Watch the customer ID to sync the input display
  const selectedCustomerId = watch('customer.id');

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    // Auto-fill all customer fields
    setValue('customer.id', customer.id ?? '');
    setValue('customer.name', customer.name ?? '');
    setValue('customer.phone', customer.phone ?? '');
    setValue('customer.email', customer.email ?? '');

    // Disable phone and email fields
    setIsCustomerSelected(true);
  };

  const handleCustomerNameInput = (name: string) => {
    // Always update the name field when user types
    setValue('customer.name', name);

    // If the input is cleared (empty), reset everything
    if (!name || name.trim() === '') {
      setValue('customer.id', '');
      setValue('customer.name', '');
      setValue('customer.phone', '');
      setValue('customer.email', '');
      setIsCustomerSelected(false);
      return;
    }

    // If they're typing and not selecting from list, enable fields
    if (!customers.find(c => c.name === name)) {
      setValue('customer.id', '');
      setIsCustomerSelected(false);
    }
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardHeader className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
            Create New Invoice
          </h3>
          <p className="text-xs text-default-500">
            Generate a professional invoice for your customer
          </p>
        </div>
      </CardHeader>

      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              Customer Details
            </h4>
            <span className="text-xs text-default-400">(Optional)</span>
          </div>
          <Divider />

          <div className="grid md:grid-cols-3 gap-4">
            <AutocompleteInput
              name="customer.id"
              control={control}
              label="Customer Name"
              placeholder="Search or enter customer name"
              items={customers}
              getOptionLabel={c => c.name ?? ''}
              getOptionValue={c => c.id ?? ''}
              onSelectionChange={handleCustomerSelect}
              onInputChange={handleCustomerNameInput}
              disallowTyping={isCustomerSelected}
            />

            <TextInput
              name="customer.phone"
              control={control}
              label="Phone Number"
              placeholder="08012345678"
              type="tel"
              isDisabled={isCustomerSelected}
            />

            <TextInput
              name="customer.email"
              control={control}
              label="Email Address"
              placeholder="customer@example.com"
              type="email"
              isDisabled={isCustomerSelected}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
