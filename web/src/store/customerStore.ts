import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import { CustomerType } from '@/types';

interface CustomerStore {
  customers: CustomerType[];
  customersByRole: {
    BUYER: CustomerType[];
    SUPPLIER: CustomerType[];
    ALL: CustomerType[];
  };
  loading: boolean;
  error: string | null;
  lastFetchTime: number | null;

  fetchCustomers: (forceRefresh?: boolean) => Promise<void>;
  fetchCustomersByRole: (
    customerRole: 'BUYER' | 'SUPPLIER',
    forceRefresh?: boolean
  ) => Promise<CustomerType[]>;
  addCustomer: (customer: CustomerType) => void;
  reset: () => void;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set, get) => ({
      customers: [],
      customersByRole: {
        BUYER: [],
        SUPPLIER: [],
        ALL: [],
      },
      loading: false,
      error: null,
      lastFetchTime: null,

      fetchCustomers: async (forceRefresh = false) => {
        const { lastFetchTime, customers } = get();
        console.log('Fetching customers from store:', {
          lastFetchTime,
          customers,
        });
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
          const fetchedCustomersByRole = response.data.customersByRole || {
            BUYER: [],
            SUPPLIER: [],
            ALL: [],
          };

          set({
            customers: fetchedCustomers,
            customersByRole: fetchedCustomersByRole,
            loading: false,
            lastFetchTime: Date.now(),
          });
          console.log('Fetched customers:', fetchedCustomers);
          console.log('Fetched customers by role:', fetchedCustomersByRole);
        } catch (error) {
          console.error('Error fetching customers:', error);
          set({
            error: 'Failed to fetch customers',
            loading: false,
          });
        }
      },

      fetchCustomersByRole: async (
        customerRole: 'BUYER' | 'SUPPLIER',
        forceRefresh = false
      ) => {
        try {
          const response = await api.get(
            `/user/customers?customerRole=${customerRole}`
          );
          const fetchedCustomers = response.data.customers || [];
          return fetchedCustomers;
        } catch (error) {
          console.error(`Error fetching ${customerRole}s:`, error);
          return [];
        }
      },

      addCustomer: (customer: CustomerType) => {
        const { customers, customersByRole } = get();

        // Update customers array
        const updatedCustomers = [customer, ...customers];

        // Update customersByRole
        const updatedCustomersByRole = {
          ...customersByRole,
          [customer.customerRole as string]: [
            customer,
            ...(customersByRole[
              customer.customerRole as keyof typeof customersByRole
            ] || []),
          ],
          ALL: updatedCustomers,
        };

        set({
          customers: updatedCustomers,
          customersByRole: updatedCustomersByRole,
        });
      },

      reset: () => {
        set({
          customers: [],
          customersByRole: {
            BUYER: [],
            SUPPLIER: [],
            ALL: [],
          },
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
        customersByRole: state.customersByRole,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
