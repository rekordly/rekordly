'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  addToast,
  Alert,
} from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';
import { useApi } from '@/hooks/useApi';
import { waitlistSchema } from '@/lib/validations/waitlist';
import { WaitlistType } from '@/types/waitlist';

interface WaitlistModalProps {
  buttonText?: string;
  className?: string;
  buttonVariant?: 'solid' | 'ghost' | 'flat' | 'bordered';
}

export function WaitlistModal({
  buttonText = 'Join the waitlist',
  className = ' bg-brand p-6 px-6',
  buttonVariant = 'solid',
}: WaitlistModalProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const methods = useForm<WaitlistType>({
    resolver: zodResolver(waitlistSchema) as Resolver<WaitlistType>,
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
    },
    mode: 'all',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = methods;

  const { post, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    successMessage: 'Successfully joined the waitlist! Check your email.',
    onSuccess: () => {
      handleClose();
    },
  });

  const onSubmit = async (data: WaitlistType) => {
    await post('/waitlist', data);
  };

  const handleClose = () => {
    reset({
      name: '',
      email: '',
      phoneNumber: '',
    });
    onClose();
  };

  return (
    <>
      <Button
        className={className}
        // color="default"
        startContent={
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        variant={buttonVariant}
        onPress={onOpen}
        size="md"
      >
        {buttonText}
      </Button>

      <Modal
        backdrop="blur"
        isOpen={isOpen}
        size="lg"
        onClose={onClose}
        scrollBehavior="inside"
        classNames={{
          base: 'max-h-[90vh] bg-brand-background',
          body: 'py-6',
        }}
      >
        <ModalContent>
          {() => (
            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)}>
                <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                  <div className="flex text-default-800 items-center gap-2">
                    {/* <Sparkles className="text-primary" size={24} /> */}
                    <span>Join the Waitlist</span>
                  </div>
                  <p className="text-xs  mt-1 font-normal text-default-500 w-10/12">
                    Be the first to know when we launch. We&apos;ll send you
                    exclusive early access!
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
                    label="Email Address"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                  />

                  <TextInput
                    isRequired
                    control={methods.control}
                    label="Phone Number "
                    name="phoneNumber"
                    type="tel"
                    placeholder="08012345678"
                  />

                  {/* <Alert
                    color="primary"
                    description="Early access, exclusive features, and special launch pricing!"
                    title="What you'll get"
                    variant="bordered"
                    classNames={{ title: 'text-sm', description: 'text-xs' }}
                  /> */}
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
                    isDisabled={isSubmitting || isLoading}
                    isLoading={isSubmitting || isLoading}
                    type="submit"
                  >
                    Join Waitlist
                  </Button>
                </ModalFooter>
              </form>
            </FormProvider>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
