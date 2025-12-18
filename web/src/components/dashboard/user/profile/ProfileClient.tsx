'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Avatar } from '@heroui/avatar';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { addToast } from '@heroui/react';
import { useSession } from 'next-auth/react';
import {
  User,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  Edit,
  Plus,
  Trash2,
  CheckCircle2,
  Upload,
  X,
} from 'lucide-react';

import { useProfileStore } from '@/store/profile-store';
import { formatCurrency, formatDate } from '@/lib/fn';
import { EditBasicDetailsModal } from '@/components/modals/userProfile/EditBasicDetailsModal';
import { EditWorkDetailsModal } from '@/components/modals/userProfile/EditWorkDetailsModal';
import { AddBankAccountModal } from '@/components/modals/userProfile/AddBankAccountModal';
import { EditBankAccountModal } from '@/components/modals/userProfile/EditBankAccountModal';
import { DeleteConfirmationModal } from '@/components/modals/userProfile/DeleteConfirmationModal';

interface ProfileClientProps {
  initialSession: any;
}

export default function ProfileClient({ initialSession }: ProfileClientProps) {
  const [showEditBasicDetails, setShowEditBasicDetails] = useState(false);
  const [showEditWorkDetails, setShowEditWorkDetails] = useState(false);
  const [showAddBankAccount, setShowAddBankAccount] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: session, update } = useSession();
  const user = session?.user || initialSession?.user;

  const {
    isUpdating,
    updateProfileImage,
    deleteProfileImage,
    deleteBankAccount,
    setDefaultBankAccount,
  } = useProfileStore();

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      addToast({
        title: 'Invalid File Type',
        description: 'Please upload a JPEG, PNG, or WebP image.',
        color: 'danger',
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      addToast({
        title: 'File Too Large',
        description: 'Maximum file size is 5MB.',
        color: 'danger',
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      await updateProfileImage(file);
      await update(); // Update session
      addToast({
        title: 'Success',
        description: 'Profile image updated successfully',
        color: 'success',
      });
    } catch (error: any) {
      addToast({
        title: 'Upload Failed',
        description: error?.response?.data?.message || 'Failed to upload image',
        color: 'danger',
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteImage = async () => {
    setDeletingImage(false);
    try {
      await deleteProfileImage();
      await update(); // Update session
      addToast({
        title: 'Success',
        description: 'Profile image deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      addToast({
        title: 'Delete Failed',
        description: error?.response?.data?.message || 'Failed to delete image',
        color: 'danger',
      });
    }
  };

  const handleDeleteBankAccount = async () => {
    if (!deletingBankId) return;

    try {
      await deleteBankAccount(deletingBankId);
      await update(); // Update session
      addToast({
        title: 'Success',
        description: 'Bank account deleted successfully',
        color: 'success',
      });
      setDeletingBankId(null);
    } catch (error) {
      addToast({
        title: 'Error',
        description: 'Failed to delete bank account',
        color: 'danger',
      });
    }
  };

  const handleSetDefaultAccount = async (id: string) => {
    try {
      await setDefaultBankAccount(id);
      await update(); // Update session
    } catch (error) {
      console.error('Failed to set default account:', error);
    }
  };

  const getPackageStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'TRIAL':
        return 'primary';
      case 'EXPIRED':
        return 'danger';
      case 'CANCELLED':
        return 'default';
      default:
        return 'default';
    }
  };

  const bankAccounts = (user?.onboarding?.bankDetails as any[]) || [];
  const deletingBankAccount = bankAccounts.find(
    (acc: any) => acc.id === deletingBankId
  );

  return (
    <>
      <div className="px-0">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground font-heading tracking-tight">
                Profile Settings
              </h1>
              <p className="text-xs text-default-500">
                Manage your account information and preferences
              </p>
            </div>
            {isUpdating && <Spinner color="primary" size="sm" />}
          </div>

          {/* Main Layout - Two Columns on Large Screens */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Column - Main Content (8 columns) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Profile Overview Card */}
              <Card
                className="rounded-3xl dark:border dark:bg-black dark:border-brand-background"
                shadow="none"
              >
                <CardBody className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <Avatar
                          className="w-24 h-24"
                          src={user?.image || undefined}
                          name={user?.name || 'User'}
                        />
                        {(isUploadingImage || isUpdating) && (
                          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                            <Spinner color="white" size="sm" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Profile Info */}
                    <div className="flex-1 space-y-2 mx-auto">
                      <div className="flex items-start justify-center md:justify-between ">
                        <div className="text-center md:text-start">
                          <h2 className="text-lg font-semibold text-foreground">
                            {user?.name || 'N/A'}
                          </h2>
                          {user?.email && (
                            <p className="text-xs text-default-500">
                              {user?.email}
                            </p>
                          )}
                          {user?.onboarding?.phoneNumber && (
                            <p className="text-xs text-default-500">
                              {user?.onboarding?.phoneNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-center md:justify-start gap-2">
                          <Button
                            size="sm"
                            variant="flat"
                            color="primary"
                            className="text-xs p-2"
                            startContent={<Upload className="size-3" />}
                            isDisabled={isUploadingImage || isUpdating}
                            onPress={() => fileInputRef.current?.click()}
                          >
                            Upload Image
                          </Button>
                          {/* {user?.image && (
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isIconOnly
                            isDisabled={isUploadingImage || isUpdating}
                            onPress={() => setDeletingImage(true)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )} */}
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Basic Details Section */}
              <Card
                className="rounded-3xl dark:border dark:bg-black dark:border-brand-background"
                shadow="none"
              >
                <CardHeader className="flex items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-foreground font-heading">
                      Basic Details
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    startContent={<Edit className="w-4 h-4" />}
                    onPress={() => setShowEditBasicDetails(true)}
                  />
                </CardHeader>
                <CardBody className="px-6 pb-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Full Name</p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.name || 'Not set'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Email</p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.email || 'Not set'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Phone Number</p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.onboarding?.phoneNumber || 'Not set'}
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Business/Work Details */}
              <Card
                className="rounded-3xl dark:border dark:bg-black dark:border-brand-background"
                shadow="none"
              >
                <CardHeader className="flex items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-foreground font-heading">
                      Work Details
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    startContent={<Edit className="w-4 h-4" />}
                    onPress={() => setShowEditWorkDetails(true)}
                  />
                </CardHeader>
                <CardBody className="px-6 pb-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">
                        Registration Type
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.onboarding?.registrationType || 'Not set'}
                      </p>
                    </div>
                    {user?.onboarding?.businessName && (
                      <div className="space-y-1">
                        <p className="text-xs text-default-500">
                          Business Name
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {user.onboarding.businessName}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-xs text-default-500">Work Types</p>
                      <div className="flex flex-wrap gap-2">
                        {user?.onboarding?.workTypes?.map(
                          (type: string, idx: number) => (
                            <Chip key={idx} size="sm" variant="flat">
                              {type}
                            </Chip>
                          )
                        ) || (
                          <span className="text-sm text-default-400">None</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Start Date</p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.onboarding?.startDate
                          ? formatDate(user.onboarding.startDate)
                          : 'Not set'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Referral Code</p>
                      <p className="text-sm font-medium text-foreground">
                        {user?.onboarding?.referralCode || 'Not set'}
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Bank Accounts Section */}
              <Card
                className="rounded-3xl dark:border dark:bg-black dark:border-brand-background"
                shadow="none"
              >
                <CardHeader className="flex items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-foreground font-heading">
                      Bank Accounts
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Plus className="w-4 h-4" />}
                    onPress={() => setShowAddBankAccount(true)}
                  >
                    Add Account
                  </Button>
                </CardHeader>
                <CardBody className="px-6 pb-6">
                  {bankAccounts.length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 mx-auto text-default-300 mb-2" />
                      <p className="text-sm text-default-500 mb-4">
                        No bank accounts added yet
                      </p>
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => setShowAddBankAccount(true)}
                      >
                        Add Your First Account
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bankAccounts.map((account: any) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-4 bg-default-50 rounded-2xl"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {account.bankName}
                                </p>
                                {account.isDefault && (
                                  <Chip
                                    size="sm"
                                    color="success"
                                    variant="flat"
                                  >
                                    Default
                                  </Chip>
                                )}
                              </div>
                              <p className="text-xs text-default-500">
                                {account.accountNumber} • {account.accountName}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {!account.isDefault && (
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                onPress={() =>
                                  handleSetDefaultAccount(account.id)
                                }
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              onPress={() => setEditingBankId(account.id)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="light"
                              color="danger"
                              isIconOnly
                              onPress={() => setDeletingBankId(account.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Right Column - Package Info (4 columns) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Package Information */}
              <Card
                className="rounded-3xl dark:border dark:bg-black dark:border-brand-background"
                shadow="none"
              >
                <CardHeader className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-foreground font-heading">
                      Active Package
                    </h3>
                  </div>
                </CardHeader>
                <CardBody className="px-6 pb-6">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Package</p>
                      <p className="text-sm font-medium text-foreground">
                        Trial Package
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-default-500">Status</p>
                      <Chip size="sm" color="primary" variant="flat">
                        TRIAL
                      </Chip>
                    </div>
                    <div className="p-3 bg-primary-50 rounded-lg">
                      <p className="text-xs text-primary-700">
                        You&apos;re currently on a trial package. Upgrade to
                        unlock more features!
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EditBasicDetailsModal
        isOpen={showEditBasicDetails}
        onClose={() => setShowEditBasicDetails(false)}
        user={user}
        onSuccess={() => update()}
      />
      <EditWorkDetailsModal
        isOpen={showEditWorkDetails}
        onClose={() => setShowEditWorkDetails(false)}
        user={user}
        onSuccess={() => update()}
      />
      <AddBankAccountModal
        isOpen={showAddBankAccount}
        onClose={() => setShowAddBankAccount(false)}
        user={user}
        onSuccess={() => update()}
      />
      {editingBankId && (
        <EditBankAccountModal
          isOpen={!!editingBankId}
          bankAccountId={editingBankId}
          user={user}
          onClose={() => setEditingBankId(null)}
          onSuccess={() => update()}
        />
      )}

      {/* Delete Image Confirmation */}
      <DeleteConfirmationModal
        isOpen={deletingImage}
        onClose={() => setDeletingImage(false)}
        onConfirm={handleDeleteImage}
        isLoading={isUpdating}
        title="Delete Profile Image"
        description="Are you sure you want to delete your profile image? This action cannot be undone."
      />

      {/* Delete Bank Account Confirmation */}
      <DeleteConfirmationModal
        isOpen={!!deletingBankId}
        onClose={() => setDeletingBankId(null)}
        onConfirm={handleDeleteBankAccount}
        isLoading={isUpdating}
        title="Delete Bank Account"
        description="Are you sure you want to delete this bank account? This action cannot be undone."
        itemDetails={
          deletingBankAccount && (
            <div className="space-y-1 text-xs">
              <p>
                <span className="font-medium">Bank:</span>{' '}
                {deletingBankAccount.bankName}
              </p>
              <p>
                <span className="font-medium">Account:</span>{' '}
                {deletingBankAccount.accountNumber}
              </p>
              <p>
                <span className="font-medium">Name:</span>{' '}
                {deletingBankAccount.accountName}
              </p>
            </div>
          )
        }
      />
    </>
  );
}
