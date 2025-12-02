import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import { CustomerType, CustomerStats } from '@/types/customer';

interface CustomerStore {
  customers: CustomerType[];
  filteredCustomers: CustomerType[]; // Add this for reactive updates
  customersByRole: {
    BUYER: CustomerType[];
    SUPPLIER: CustomerType[];
    ALL: CustomerType[];
  };
  stats: CustomerStats | null;
  loading: boolean;
  isDeleting: boolean;
  error: string | null;
  lastFetchTime: number | null;

  // Filters
  searchQuery: string;
  roleFilter: 'ALL' | 'BUYER' | 'SUPPLIER';

  fetchCustomers: (forceRefresh?: boolean) => Promise<void>;
  fetchCustomersByRole: (
    customerRole: 'BUYER' | 'SUPPLIER',
    forceRefresh?: boolean
  ) => Promise<CustomerType[]>;
  addCustomer: (customer: CustomerType) => void;
  updateCustomer: (id: string, updates: Partial<CustomerType>) => void;
  deleteCustomer: (id: string) => Promise<void>;
  searchCustomers: (query: string) => void;
  setRoleFilter: (role: 'ALL' | 'BUYER' | 'SUPPLIER') => void;
  applyFilters: () => void; // Add this method
  getFilteredCustomers: () => CustomerType[];
  reset: () => void;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set, get) => ({
      customers: [],
      filteredCustomers: [], // Initialize filtered customers
      customersByRole: {
        BUYER: [],
        SUPPLIER: [],
        ALL: [],
      },
      stats: null,
      loading: false,
      isDeleting: false,
      error: null,
      lastFetchTime: null,
      searchQuery: '',
      roleFilter: 'ALL',

      applyFilters: () => {
        const { customers, searchQuery, roleFilter } = get();

        let filtered = customers;

        // Apply role filter
        if (roleFilter !== 'ALL') {
          filtered = filtered.filter(c => c.customerRole === roleFilter);
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            c =>
              c.name.toLowerCase().includes(query) ||
              c.email?.toLowerCase().includes(query) ||
              c.phone?.toLowerCase().includes(query)
          );
        }

        set({ filteredCustomers: filtered });
      },

      fetchCustomers: async (forceRefresh = false) => {
        const { lastFetchTime, customers } = get();
        const now = Date.now();

        if (
          !forceRefresh &&
          customers.length > 0 &&
          lastFetchTime &&
          now - lastFetchTime < CACHE_DURATION
        ) {
          // Still apply filters even when using cached data
          get().applyFilters();
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
          const fetchedStats = response.data.stats || null;
          set({
            customers: fetchedCustomers,
            customersByRole: fetchedCustomersByRole,
            stats: fetchedStats,
            loading: false,
            lastFetchTime: Date.now(),
          });

          // Apply filters after fetching
          get().applyFilters();
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
        const { customers, customersByRole, stats } = get();

        // Update customers array
        const updatedCustomers = [customer, ...customers];

        // Update customersByRole
        const updatedCustomersByRole = {
          ...customersByRole,
          [customer.customerRole]: [
            customer,
            ...(customersByRole[customer.customerRole] || []),
          ],
          ALL: updatedCustomers,
        };

        // Update stats
        const updatedStats = stats
          ? {
              ...stats,
              totalCustomers: stats.totalCustomers + 1,
              totalBuyers:
                customer.customerRole === 'BUYER'
                  ? stats.totalBuyers + 1
                  : stats.totalBuyers,
              totalSuppliers:
                customer.customerRole === 'SUPPLIER'
                  ? stats.totalSuppliers + 1
                  : stats.totalSuppliers,
            }
          : null;

        set({
          customers: updatedCustomers,
          customersByRole: updatedCustomersByRole,
          stats: updatedStats,
          lastFetchTime: Date.now(),
        });

        // Apply filters after adding
        get().applyFilters();
      },

      updateCustomer: (id: string, updates: Partial<CustomerType>) => {
        const { customers, customersByRole, stats } = get();

        const oldCustomer = customers.find(c => c.id === id);
        const updatedCustomers = customers.map(c =>
          c.id === id ? { ...c, ...updates } : c
        );

        // Recalculate customersByRole
        const updatedCustomersByRole = {
          BUYER: updatedCustomers.filter(c => c.customerRole === 'BUYER'),
          SUPPLIER: updatedCustomers.filter(c => c.customerRole === 'SUPPLIER'),
          ALL: updatedCustomers,
        };

        // Update stats if role changed
        let updatedStats = stats;
        if (
          oldCustomer &&
          updates.customerRole &&
          oldCustomer.customerRole !== updates.customerRole
        ) {
          updatedStats = stats
            ? {
                ...stats,
                totalBuyers:
                  updates.customerRole === 'BUYER'
                    ? stats.totalBuyers + 1
                    : stats.totalBuyers - 1,
                totalSuppliers:
                  updates.customerRole === 'SUPPLIER'
                    ? stats.totalSuppliers + 1
                    : stats.totalSuppliers - 1,
              }
            : null;
        }

        set({
          customers: updatedCustomers,
          customersByRole: updatedCustomersByRole,
          stats: updatedStats,
          lastFetchTime: Date.now(),
        });

        // Apply filters after updating
        get().applyFilters();
      },

      deleteCustomer: async (id: string) => {
        set({ isDeleting: true });
        try {
          await api.delete(`/user/customers/${id}`);
          const { customers, customersByRole, stats } = get();

          // Find the customer being deleted
          const deletedCustomer = customers.find(c => c.id === id);

          // Update customers array
          const updatedCustomers = customers.filter(c => c.id !== id);

          // Update customersByRole
          const updatedCustomersByRole = {
            BUYER: updatedCustomers.filter(c => c.customerRole === 'BUYER'),
            SUPPLIER: updatedCustomers.filter(
              c => c.customerRole === 'SUPPLIER'
            ),
            ALL: updatedCustomers,
          };

          // Update stats
          const updatedStats =
            stats && deletedCustomer
              ? {
                  ...stats,
                  totalCustomers: stats.totalCustomers - 1,
                  totalBuyers:
                    deletedCustomer.customerRole === 'BUYER'
                      ? stats.totalBuyers - 1
                      : stats.totalBuyers,
                  totalSuppliers:
                    deletedCustomer.customerRole === 'SUPPLIER'
                      ? stats.totalSuppliers - 1
                      : stats.totalSuppliers,
                }
              : stats;

          set({
            customers: updatedCustomers,
            customersByRole: updatedCustomersByRole,
            stats: updatedStats,
            lastFetchTime: Date.now(),
            isDeleting: false,
          });

          // Apply filters after deleting
          get().applyFilters();
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      searchCustomers: (query: string) => {
        set({ searchQuery: query });
        get().applyFilters();
      },

      setRoleFilter: (role: 'ALL' | 'BUYER' | 'SUPPLIER') => {
        set({ roleFilter: role });
        get().applyFilters();
      },

      getFilteredCustomers: () => {
        return get().filteredCustomers;
      },

      reset: () => {
        set({
          customers: [],
          filteredCustomers: [],
          customersByRole: {
            BUYER: [],
            SUPPLIER: [],
            ALL: [],
          },
          stats: null,
          loading: false,
          isDeleting: false,
          error: null,
          lastFetchTime: null,
          searchQuery: '',
          roleFilter: 'ALL',
        });
      },
    }),
    {
      name: 'customer-storage',
      partialize: state => ({
        customers: state.customers,
        customersByRole: state.customersByRole,
        stats: state.stats,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
