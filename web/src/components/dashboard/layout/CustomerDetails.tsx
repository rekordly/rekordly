'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { Checkbox } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import { useState, useEffect } from 'react';

import { AutocompleteInput, TextInput } from '@/components/ui/Input';
import { CustomerType } from '@/types';

interface CustomerDetailsProps {
  customers: CustomerType[];
  role?: 'BUYER' | 'SUPPLIER' | 'CUSTOMER';
  title?: string;
  optional?: boolean;
}

export function CustomerDetails({
  customers,
  role = 'CUSTOMER',
  title,
  optional = true,
}: CustomerDetailsProps) {
  const { control, setValue, watch } = useFormContext();
  const [isCustomerSelected, setIsCustomerSelected] = useState(false);
  const [showAddAsNewCustomer, setShowAddAsNewCustomer] = useState(false);

  // Get the appropriate title based on role
  const getRoleTitle = () => {
    if (title) return title;
    switch (role) {
      case 'BUYER':
        return 'Customer Details';
      case 'SUPPLIER':
        return 'Supplier Details';
      default:
        return 'Customer Details';
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'BUYER':
        return 'Customer';
      case 'SUPPLIER':
        return 'Supplier';
      default:
        return 'Customer';
    }
  };

  const getRolePlaceholder = () => {
    switch (role) {
      case 'BUYER':
        return 'Search or enter customer name';
      case 'SUPPLIER':
        return 'Search or enter supplier name';
      default:
        return 'Search or enter customer name';
    }
  };

  const getAddAsNewText = () => {
    switch (role) {
      case 'BUYER':
        return 'Add as new customer';
      case 'SUPPLIER':
        return 'Add as new supplier';
      default:
        return 'Add as new customer';
    }
  };

  const getSaveForFutureText = () => {
    switch (role) {
      case 'BUYER':
        return 'Save this customer for future invoices';
      case 'SUPPLIER':
        return 'Save this supplier for future purchases';
      default:
        return 'Save this customer for future invoices';
    }
  };

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
      setValue(
        'customer.customerRole',
        role === 'SUPPLIER' ? 'SUPPLIER' : 'BUYER'
      );
      setShowAddAsNewCustomer(false);

      return;
    }

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
                {getRoleTitle()}
              </h4>
              {optional && (
                <span className="text-xs text-default-400">(Optional)</span>
              )}
            </div>
            <Divider />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <AutocompleteInput
                control={control}
                disallowTyping={isCustomerSelected || selectedCustomerId}
                getOptionLabel={c => c.name ?? ''}
                getOptionValue={c => c.id ?? ''}
                items={customers}
                label={`${getRoleLabel()} Name`}
                name="customer.id"
                placeholder={getRolePlaceholder()}
                onInputChange={handleCustomerNameInput}
                onSelectionChange={handleCustomerSelect}
              />
            </div>

            <TextInput
              control={control}
              isDisabled={isCustomerSelected || selectedCustomerId}
              label="Phone Number"
              name="customer.phone"
              placeholder="08012345678"
              type="tel"
            />

            <TextInput
              control={control}
              isDisabled={isCustomerSelected || selectedCustomerId}
              label="Email Address"
              name="customer.email"
              placeholder="customer@example.com"
              type="email"
            />
          </div>

          {!selectedCustomerId && (
            <div className="pt-2">
              <Checkbox
                name="addAsNewCustomer"
                size="sm"
                onChange={e => setValue('addAsNewCustomer', e.target.checked)}
              >
                <span className="text-sm">{getAddAsNewText()}</span>
              </Checkbox>
              <p className="text-xs text-default-400 ml-6">
                {getSaveForFutureText()}
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
