import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/axios';
import {
  ProfileStore,
  ProfileData,
  UpdateBasicDetailsType,
  UpdateWorkDetailsType,
  AddBankAccountType,
} from '@/types/profile';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,
      isLoading: false,
      isUpdating: false,
      error: null,

      fetchProfile: async () => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.get('/user/profile');
          const profile = response.data.profile;

          set({
            profile,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error?.response?.data?.message || 'Failed to fetch profile',
            isLoading: false,
          });
        }
      },

      updateBasicDetails: async (data: UpdateBasicDetailsType) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch('/user/profile/basic-details', data);
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error: error?.response?.data?.message || 'Failed to update profile',
            isUpdating: false,
          });
          throw error;
        }
      },

      updateWorkDetails: async (data: UpdateWorkDetailsType) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch('/user/profile/work-details', data);
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to update work details',
            isUpdating: false,
          });
          throw error;
        }
      },

      updateProfileImage: async (file: File) => {
        set({ isUpdating: true, error: null });

        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await api.post('/user/profile/image', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message ||
              'Failed to update profile image',
            isUpdating: false,
          });
          throw error;
        }
      },

      deleteProfileImage: async () => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.delete('/user/profile/image');
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message ||
              'Failed to delete profile image',
            isUpdating: false,
          });
          throw error;
        }
      },

      addBankAccount: async (data: AddBankAccountType) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.post('/user/profile/bank-accounts', data);
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to add bank account',
            isUpdating: false,
          });
          throw error;
        }
      },

      updateBankAccount: async (
        id: string,
        data: Partial<AddBankAccountType>
      ) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch(
            `/user/profile/bank-accounts/${id}`,
            data
          );
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to update bank account',
            isUpdating: false,
          });
          throw error;
        }
      },

      deleteBankAccount: async (id: string) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.delete(
            `/user/profile/bank-accounts/${id}`
          );
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to delete bank account',
            isUpdating: false,
          });
          throw error;
        }
      },

      setDefaultBankAccount: async (id: string) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch(
            `/user/profile/bank-accounts/${id}/set-default`
          );
          const updatedProfile = response.data.profile;

          set({
            profile: updatedProfile,
            isUpdating: false,
          });
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to set default account',
            isUpdating: false,
          });
          throw error;
        }
      },

      refreshProfile: async () => {
        await get().fetchProfile();
      },

      reset: () => {
        set({
          profile: null,
          isLoading: false,
          isUpdating: false,
          error: null,
        });
      },
    }),
    {
      name: 'profile-storage',
      partialize: state => ({
        profile: state.profile,
      }),
    }
  )
);
