'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
  Checkbox,
} from '@heroui/react';
import { Building2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useEffect } from 'react';

import { TextInput } from '@/components/ui/Input';
import { AddBankAccountSchema } from '@/lib/validations/profile';
import { AddBankAccountType } from '@/types/profile';
import { useProfileStore } from '@/store/profile-store';

interface AddBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onSuccess?: () => void;
}

export function AddBankAccountModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: AddBankAccountModalProps) {
  const { addBankAccount, isUpdating } = useProfileStore();

  const methods = useForm<AddBankAccountType>({
    resolver: zodResolver(AddBankAccountSchema) as Resolver<AddBankAccountType>,
    defaultValues: {
      bankName: '',
      accountNumber: '',
      accountName: '',
      isDefault: false,
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    register,
  } = methods;

  useEffect(() => {
    if (isOpen) {
      // If no bank accounts exist, set this as default
      const hasNoBankAccounts = !user?.onboarding?.bankDetails?.length;
      reset({
        bankName: '',
        accountNumber: '',
        accountName: '',
        isDefault: hasNoBankAccounts,
      });
    }
  }, [isOpen, user, reset]);

  const onSubmit = async (data: AddBankAccountType) => {
    try {
      await addBankAccount(data);
      if (onSuccess) await onSuccess();
      addToast({
        title: 'Success',
        description: 'Bank account added successfully',
        color: 'success',
      });
      handleClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to add bank account',
        color: 'danger',
      });
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
                  <Building2 className="text-primary" size={24} />
                  <span>Add Bank Account</span>
                </div>
                <p className="text-xs text-default-500 mt-1">
                  Add a new bank account for payments
                </p>
              </ModalHeader>

              <ModalBody className="gap-4">
                <TextInput
                  isRequired
                  control={methods.control}
                  label="Bank Name"
                  name="bankName"
                  placeholder="e.g., First Bank, GTBank"
                />

                <TextInput
                  isRequired
                  control={methods.control}
                  label="Account Number"
                  name="accountNumber"
                  placeholder="Enter 10-digit account number"
                  //   maxLength={10}
                />

                <TextInput
                  isRequired
                  control={methods.control}
                  label="Account Name"
                  name="accountName"
                  placeholder="Enter account holder name"
                />

                <Checkbox {...register('isDefault')} size="sm">
                  Set as default account
                </Checkbox>
              </ModalBody>

              <ModalFooter>
                <Button
                  isDisabled={isSubmitting || isUpdating}
                  variant="light"
                  onPress={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isDisabled={isSubmitting || isUpdating}
                  isLoading={isSubmitting || isUpdating}
                  type="submit"
                >
                  Add Account
                </Button>
              </ModalFooter>
            </form>
          </FormProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
