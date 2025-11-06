import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { CustomerType } from '@/types';

interface CustomerStore {
  customers: CustomerType[];
  loading: boolean;
  error: string | null;
  lastFetchTime: number | null;

  fetchCustomers: (forceRefresh?: boolean) => Promise<void>;
  addCustomer: (customer: CustomerType) => void;
  reset: () => void;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set, get) => ({
      customers: [],
      loading: false,
      error: null,
      lastFetchTime: null,

      fetchCustomers: async (forceRefresh = false) => {
        const { lastFetchTime, customers } = get();
        const now = Date.now();

        if (
          !forceRefresh &&
          customers.length > 0 &&
          lastFetchTime &&
          now - lastFetchTime < CACHE_DURATION
        ) {
          return;
        }

        set({ loading: true, error: null });

        try {
          const response = await api.get('/user/customers');
          const fetchedCustomers = response.data.customers || [];

          set({
            customers: fetchedCustomers,
            loading: false,
            lastFetchTime: Date.now(),
          });
        } catch (error) {
          console.error('Error fetching customers:', error);
          set({
            error: 'Failed to fetch customers',
            loading: false,
          });
        }
      },

      addCustomer: (customer: CustomerType) => {
        const { customers } = get();
        set({ customers: [customer, ...customers] });
      },

      reset: () => {
        set({
          customers: [],
          loading: false,
          error: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'customer-storage',
      partialize: state => ({
        customers: state.customers,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
