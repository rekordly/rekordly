'use client';

import { Card, CardBody, CardHeader } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { Checkbox } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import { AutocompleteInput, TextInput } from '@/components/ui/Input';
import { CustomerType } from '@/types/invoice';
import { useState, useEffect } from 'react';

interface CustomerDetailsProps {
  customers: CustomerType[];
}

export function CustomerDetails({ customers }: CustomerDetailsProps) {
  const { control, setValue, watch } = useFormContext();
  const [isCustomerSelected, setIsCustomerSelected] = useState(false);
  const [showAddAsNewCustomer, setShowAddAsNewCustomer] = useState(false);

  const selectedCustomerId = watch('customer.id');
  const customerName = watch('customer.name');
  const customerPhone = watch('customer.phone');
  const customerEmail = watch('customer.email');

  // Check if we should show "Add as new customer" checkbox
  useEffect(() => {
    if (isCustomerSelected) {
      // If existing customer is selected, hide the checkbox
      setShowAddAsNewCustomer(false);
      setValue('addAsNewCustomer', false);
      return;
    }

    // Show checkbox if user manually typed name AND (phone OR email)
    const hasManualInput =
      customerName &&
      customerName.trim() !== '' &&
      (customerPhone?.trim() || customerEmail?.trim());

    setShowAddAsNewCustomer(!!hasManualInput);

    // Auto-uncheck if conditions not met
    if (!hasManualInput) {
      setValue('addAsNewCustomer', false);
    }
  }, [
    customerName,
    customerPhone,
    customerEmail,
    isCustomerSelected,
    setValue,
  ]);

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    // Auto-fill all customer fields
    setValue('customer.id', customer.id ?? '');
    setValue('customer.name', customer.name ?? '');
    setValue('customer.phone', customer.phone ?? '');
    setValue('customer.email', customer.email ?? '');
    setValue('addAsNewCustomer', false);

    setIsCustomerSelected(true);
    setShowAddAsNewCustomer(false);
  };

  const handleCustomerNameInput = (name: string) => {
    setValue('customer.name', name);

    if (!name || name.trim() === '') {
      setValue('customer.id', '');
      setValue('customer.name', '');
      setValue('customer.phone', '');
      setValue('customer.email', '');
      setValue('addAsNewCustomer', false);
      setIsCustomerSelected(false);
      setShowAddAsNewCustomer(false);
      return;
    }

    // If they're typing and not selecting from list, enable fields
    if (!customers.find(c => c.name === name)) {
      setValue('customer.id', '');
      setIsCustomerSelected(false);
    }
  };

  return (
    <Card className="w-full rounded-2xl " shadow="none">
      <CardBody>
        <div className="space-y-4 py-2">
          <div className="space-y-2 px-2 ">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                Customer Details
              </h4>
              <span className="text-xs text-default-400">(Optional)</span>
            </div>
            <Divider />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
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
            </div>

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

          {showAddAsNewCustomer && (
            <div className="pt-2">
              <Checkbox
                name="addAsNewCustomer"
                size="sm"
                onChange={e => setValue('addAsNewCustomer', e.target.checked)}
              >
                <span className="text-sm">Add as new customer</span>
              </Checkbox>
              <p className="text-xs text-default-400 ml-6">
                Save this customer for future invoices
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
