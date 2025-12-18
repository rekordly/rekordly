'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
} from '@heroui/react';
import { User } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useEffect } from 'react';

import { TextInput } from '@/components/ui/Input';
import { UpdateBasicDetailsSchema } from '@/lib/validations/profile';
import { UpdateBasicDetailsType } from '@/types/profile';
import { useProfileStore } from '@/store/profile-store';

interface EditBasicDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onSuccess?: () => void;
}

export function EditBasicDetailsModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditBasicDetailsModalProps) {
  const { updateBasicDetails, isUpdating } = useProfileStore();

  const methods = useForm<UpdateBasicDetailsType>({
    resolver: zodResolver(
      UpdateBasicDetailsSchema
    ) as Resolver<UpdateBasicDetailsType>,
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phoneNumber: user?.onboarding?.phoneNumber || '',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = methods;

  useEffect(() => {
    if (isOpen && user) {
      reset({
        name: user.name || '',
        email: user.email || '',
        phoneNumber: user.onboarding?.phoneNumber || '',
      });
    }
  }, [isOpen, user, reset]);

  const onSubmit = async (data: UpdateBasicDetailsType) => {
    try {
      await updateBasicDetails(data);
      addToast({
        title: 'Success',
        description: 'Profile updated successfully',
        color: 'success',
      });
      if (onSuccess) await onSuccess();
      handleClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to update profile',
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
                  <User className="text-primary" size={24} />
                  <span>Edit Basic Details</span>
                </div>
                <p className="text-xs text-default-500 mt-1">
                  Update your personal information
                </p>
              </ModalHeader>

              <ModalBody className="gap-4">
                <TextInput
                  isRequired
                  control={methods.control}
                  label="Full Name"
                  name="name"
                  placeholder="Enter your full name"
                />

                <TextInput
                  isRequired
                  control={methods.control}
                  label="Email"
                  name="email"
                  placeholder="Enter your email"
                  type="email"
                />

                <TextInput
                  isRequired
                  control={methods.control}
                  label="Phone Number"
                  name="phoneNumber"
                  placeholder="Enter your phone number"
                  type="tel"
                />
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
                  Update Profile
                </Button>
              </ModalFooter>
            </form>
          </FormProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
