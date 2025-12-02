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
  const [showAddAsNewCustomer, setShowAddAsNewCustomer] = useState(false);
  const [isExistingCustomerSelected, setIsExistingCustomerSelected] =
    useState(false);

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
    if (isExistingCustomerSelected) {
      // If existing customer is selected via dropdown, hide the checkbox
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
    isExistingCustomerSelected,
    setValue,
  ]);

  const handleCustomerSelect = (customerId: string) => {
    if (!customerId) {
      // Selection was cleared
      setIsExistingCustomerSelected(false);
      setValue('customer.id', '');
      return;
    }

    const customer = customers.find(c => c.id === customerId);

    if (!customer) return;

    // Mark that an existing customer was selected from dropdown
    setIsExistingCustomerSelected(true);

    // Auto-fill all customer fields
    setValue('customer.id', customer.id ?? '');
    setValue('customer.name', customer.name ?? ''); // This will be set by AutocompleteInput
    setValue('customer.phone', customer.phone ?? '');
    setValue('customer.email', customer.email ?? '');
    setValue('addAsNewCustomer', false);
    setShowAddAsNewCustomer(false);
  };

  const handleCustomerNameInput = (name: string) => {
    // Always update the name field
    setValue('customer.name', name);

    if (!name || name.trim() === '') {
      // Clear all fields if name is empty
      setValue('customer.id', '');
      setValue('customer.phone', '');
      setValue('customer.email', '');
      setValue('addAsNewCustomer', false);
      setValue(
        'customer.customerRole',
        role === 'SUPPLIER' ? 'SUPPLIER' : 'BUYER'
      );
      setShowAddAsNewCustomer(false);
      setIsExistingCustomerSelected(false);
      return;
    }

    // Don't auto-select when typing - let user type freely
    // Only clear the ID to indicate it's potentially a new customer
    setValue('customer.id', '');
    setIsExistingCustomerSelected(false);
  };

  // Watch for changes to phone/email to clear selection if edited
  useEffect(() => {
    if (isExistingCustomerSelected) {
      // If phone or email is edited after selecting an existing customer,
      // clear the selection
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        const phoneChanged = (customerPhone || '') !== (customer.phone || '');
        const emailChanged = (customerEmail || '') !== (customer.email || '');

        if (phoneChanged || emailChanged) {
          setValue('customer.id', '');
          setIsExistingCustomerSelected(false);
        }
      }
    }
  }, [
    customerPhone,
    customerEmail,
    isExistingCustomerSelected,
    selectedCustomerId,
    customers,
    setValue,
  ]);

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
                // Only disable typing when an existing customer is actively selected
                disallowTyping={isExistingCustomerSelected}
                getOptionLabel={c => c.name ?? ''}
                getOptionValue={c => c.id ?? ''}
                items={customers}
                label={`${getRoleLabel()} Name`}
                name="customer.name"
                placeholder={getRolePlaceholder()}
                onInputChange={handleCustomerNameInput}
                onSelectionChange={handleCustomerSelect}
              />
            </div>

            <TextInput
              control={control}
              isDisabled={isExistingCustomerSelected}
              label="Phone Number"
              name="customer.phone"
              placeholder="08012345678"
              type="tel"
            />

            <TextInput
              control={control}
              isDisabled={isExistingCustomerSelected}
              label="Email Address"
              name="customer.email"
              placeholder="customer@example.com"
              type="email"
            />
          </div>

          {!isExistingCustomerSelected && showAddAsNewCustomer && (
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
