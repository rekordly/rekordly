'use client';

import React, { useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  addToast,
} from '@heroui/react';
import { UserPlus, UserCog } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';

import { TextInput, DropdownInput } from '@/components/ui/Input';
import { CustomerType } from '@/types';
import { CustomerType as Customer } from '@/types/customer';
import { useApi } from '@/hooks/useApi';
import { useCustomerStore } from '@/store/customerStore';
import { customerSchema } from '@/lib/validations/general';

interface AddEditCustomerModalProps {
  customer?: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

const customerRoleOptions = [
  { label: 'Customer (Buyer)', value: 'BUYER' },
  { label: 'Vendor (Supplier)', value: 'SUPPLIER' },
];

export function AddEditCustomerModal({
  customer,
  isOpen,
  onClose,
}: AddEditCustomerModalProps) {
  const isEditMode = !!customer;
  const { addCustomer, updateCustomer } = useCustomerStore();

  const methods = useForm<CustomerType>({
    resolver: zodResolver(customerSchema) as Resolver<CustomerType>,
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      customerRole: 'BUYER',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = methods;

  // Reset form when modal opens or customer changes
  useEffect(() => {
    if (isOpen) {
      if (customer) {
        reset({
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || '',
          customerRole: customer.customerRole,
        });
      } else {
        reset({
          name: '',
          email: '',
          phone: '',
          customerRole: 'BUYER',
        });
      }
    }
  }, [isOpen, customer, reset]);

  const { post, patch, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    successMessage: isEditMode
      ? 'Customer updated successfully'
      : 'Customer added successfully',
    onSuccess: data => {
      console.log('API Response:', data);

      if (data.customer) {
        // Ensure the customer has all required fields with defaults
        const customerData = {
          id: data.customer.id,
          name: data.customer.name,
          email: data.customer.email || null,
          phone: data.customer.phone || null,
          customerRole: data.customer.customerRole,
          createdAt: data.customer.createdAt,
          updatedAt: data.customer.updatedAt,
          // Add financial fields with defaults
          totalSpent: data.customer.totalSpent || 0,
          totalOwed: data.customer.totalOwed || 0,
          totalRevenue: data.customer.totalRevenue || 0,
          totalDebt: data.customer.totalDebt || 0,
          // Add _count field
          _count: data.customer._count || {
            sales: 0,
            purchases: 0,
            invoices: 0,
          },
        };

        if (isEditMode && customer?.id) {
          updateCustomer(customer.id, customerData);
        } else {
          addCustomer(customerData);
        }
      }

      handleClose();
    },
  });

  const onSubmit = async (data: CustomerType) => {
    try {
      // Clean up empty strings
      const cleanData = {
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined,
      };

      if (isEditMode) {
        await patch(`/user/customers/${customer.id}`, cleanData);
      } else {
        await post('/user/customers', cleanData);
      }
    } catch (error) {
      console.error('Customer form error:', error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      size="lg"
      onClose={handleClose}
    >
      <ModalContent>
        {() => (
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                <div className="flex items-center gap-2">
                  {isEditMode ? (
                    <>
                      <UserCog className="text-primary" size={24} />
                      <span>Edit Customer</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="text-primary" size={24} />
                      <span>Add New Customer</span>
                    </>
                  )}
                </div>
                {isEditMode && (
                  <p className="text-xs font-normal text-default-500 mt-1">
                    Customer ID: {customer?.id?.substring(0, 12) || 'N/A'}...
                  </p>
                )}
              </ModalHeader>

              <ModalBody className="gap-4">
                <TextInput
                  isRequired
                  control={methods.control}
                  label="Customer Name"
                  name="name"
                  placeholder="Enter customer name"
                  description="Full name or business name"
                />

                <DropdownInput
                  isRequired
                  control={methods.control}
                  items={customerRoleOptions}
                  label="Customer Type"
                  name="customerRole"
                  placeholder="Select customer type"
                  description="Choose whether this is a buyer (customer) or supplier (vendor)"
                />

                <TextInput
                  control={methods.control}
                  label="Email Address"
                  name="email"
                  placeholder="email@example.com"
                  type="email"
                  description="Optional: Customer's email address"
                />

                <TextInput
                  control={methods.control}
                  label="Phone Number"
                  name="phone"
                  placeholder="+234 800 000 0000"
                  type="tel"
                  description="Optional: Customer's phone number"
                />

                <div className="bg-default-50 p-3 rounded-lg">
                  <p className="text-xs text-default-600">
                    💡 <strong>Tip:</strong>{' '}
                    {isEditMode
                      ? 'Update customer information to keep your records accurate.'
                      : 'At least name and customer type are required. Contact information is optional but recommended.'}
                  </p>
                </div>
              </ModalBody>

              <ModalFooter>
                <Button
                  isDisabled={isSubmitting || isLoading}
                  variant="light"
                  onPress={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting || isLoading}
                  type="submit"
                >
                  {isEditMode ? 'Update Customer' : 'Add Customer'}
                </Button>
              </ModalFooter>
            </form>
          </FormProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
