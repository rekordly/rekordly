// components/modals/EditWorkDetailsModal.tsx
'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
  CheckboxGroup,
  Checkbox,
} from '@heroui/react';
import { Briefcase } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Controller } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useEffect } from 'react';

import { TextInput, DropdownInput } from '@/components/ui/Input';
import { UpdateWorkDetailsSchema } from '@/lib/validations/profile';
import { UpdateWorkDetailsType } from '@/types/profile';
import { useProfileStore } from '@/store/profile-store';

import {
  validRegistrationTypes,
  workTypes,
} from '@/components/onboarding/constant';

interface EditWorkDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onSuccess?: () => void;
}

export function EditWorkDetailsModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditWorkDetailsModalProps) {
  const { updateWorkDetails, isUpdating } = useProfileStore();

  const methods = useForm<UpdateWorkDetailsType>({
    resolver: zodResolver(
      UpdateWorkDetailsSchema
    ) as Resolver<UpdateWorkDetailsType>,
    defaultValues: {
      registrationType: user?.onboarding?.registrationType || '',
      businessName: user?.onboarding?.businessName || '',
      workTypes: user?.onboarding?.workTypes || [],
      startDate: user?.onboarding?.startDate
        ? new Date(user.onboarding.startDate).toISOString().split('T')[0]
        : '',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    control,
    watch,
  } = methods;

  const registrationType = watch('registrationType');
  const showBusinessName =
    registrationType && registrationType !== 'Not yet registered';

  useEffect(() => {
    if (isOpen && user?.onboarding) {
      reset({
        registrationType: user.onboarding.registrationType || '',
        businessName: user.onboarding.businessName || '',
        workTypes: (user.onboarding.workTypes as string[]) || [],
        startDate: user.onboarding.startDate
          ? new Date(user.onboarding.startDate).toISOString().split('T')[0]
          : '',
      });
    }
  }, [isOpen, user, reset]);

  const onSubmit = async (data: UpdateWorkDetailsType) => {
    try {
      await updateWorkDetails(data);
      addToast({
        title: 'Success',
        description: 'Work details updated successfully',
        color: 'success',
      });
      if (onSuccess) await onSuccess();
      handleClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to update work details',
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
      scrollBehavior="inside"
      onClose={handleClose}
    >
      <ModalContent>
        {() => (
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                <div className="flex items-center gap-2">
                  <Briefcase className="text-primary" size={24} />
                  <span>Edit Work Details</span>
                </div>
                <p className="text-xs text-default-500 mt-1">
                  Update your work and business information
                </p>
              </ModalHeader>

              <ModalBody className="gap-4">
                <Controller
                  name="workTypes"
                  control={control}
                  render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Work Types <span className="text-danger">*</span>
                      </label>
                      <CheckboxGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        classNames={{
                          wrapper: 'gap-2',
                        }}
                      >
                        {workTypes.map(type => (
                          <Checkbox
                            key={type.value}
                            value={type.value}
                            size="sm"
                          >
                            {type.label}
                          </Checkbox>
                        ))}
                      </CheckboxGroup>
                      {fieldState.error && (
                        <span className="text-xs text-danger">
                          {fieldState.error.message}
                        </span>
                      )}
                    </div>
                  )}
                />

                <DropdownInput
                  isRequired
                  control={methods.control}
                  items={validRegistrationTypes}
                  label="Registration Type"
                  name="registrationType"
                  placeholder="Select registration type"
                />

                {showBusinessName && (
                  <TextInput
                    control={methods.control}
                    label="Business Name"
                    name="businessName"
                    placeholder="Enter your business name"
                  />
                )}

                <TextInput
                  isRequired
                  control={methods.control}
                  label="Start Date"
                  name="startDate"
                  type="date"
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
                  Update Details
                </Button>
              </ModalFooter>
            </form>
          </FormProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
