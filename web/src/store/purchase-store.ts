import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseDate, CalendarDate } from '@internationalized/date';

import { api } from '@/lib/axios';
import {
  PurchaseStore,
  Purchase,
  PurchaseStatusType,
  DateFilterType,
} from '@/types/purchases';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000;

// Helper function to convert DateValue to Date
const dateValueToDate = (dateValue: any): Date => {
  if (!dateValue) return new Date();

  // If it's already a Date, return it
  if (dateValue instanceof Date) return dateValue;

  // If it's a CalendarDate or other DateValue type
  if (dateValue.year && dateValue.month && dateValue.day) {
    return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
  }

  // Fallback
  return new Date(dateValue);
};

export const usePurchaseStore = create<PurchaseStore>()(
  persist(
    (set, get) => ({
      allPurchases: [],
      displayedPurchases: [],
      filteredPurchases: [],
      isInitialLoading: false,
      isPaginating: false,
      isDeleting: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      statusFilter: 'ALL',
      dateFilter: null,
      lastFetchTime: null,

      fetchPurchases: async (forceRefresh = false) => {
        const { lastFetchTime, allPurchases } = get();
        const now = Date.now();

        if (allPurchases.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allPurchases.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allPurchases.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/purchases?limit=10000');
          const purchases = response.data.purchases || [];

          set({
            allPurchases: purchases,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch {
          set({
            error: 'Failed to fetch purchases',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredPurchases } = get();

        if (displayCount >= filteredPurchases.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredPurchases.length
          );

          set({
            displayCount: newCount,
            displayedPurchases: filteredPurchases.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchPurchases: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setStatusFilter: (status: PurchaseStatusType | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setDateFilter: (dateRange: DateFilterType | null) => {
        set({ dateFilter: dateRange, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allPurchases,
          searchQuery,
          statusFilter,
          dateFilter,
          displayCount,
        } = get();

        let filtered = [...allPurchases];

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(
            purchase => purchase.status === statusFilter
          );
        }

        // Apply date filter
        if (dateFilter && (dateFilter.start || dateFilter.end)) {
          filtered = filtered.filter(purchase => {
            const purchaseDate = new Date(purchase.purchaseDate);

            // Convert DateValue to Date
            const startDate = dateFilter.start
              ? dateValueToDate(dateFilter.start)
              : null;
            const endDate = dateFilter.end
              ? dateValueToDate(dateFilter.end)
              : null;

            if (startDate && purchaseDate < startDate) return false;
            if (endDate && purchaseDate > endDate) return false;

            return true;
          });
        }

        // Apply search filter (local search)
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(purchase => {
            const vendorName = purchase.vendorName || '';
            const customerName =
              purchase.customer?.name || purchase.vendorName || '';
            const title = purchase.title || '';
            const purchaseNumber = purchase.purchaseNumber || '';
            const amount = purchase.totalAmount.toString();

            return (
              vendorName.toLowerCase().includes(lowerQuery) ||
              customerName.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              purchaseNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) =>
            new Date(b.purchaseDate).getTime() -
            new Date(a.purchaseDate).getTime()
        );

        set({
          filteredPurchases: filtered,
          displayedPurchases: filtered.slice(0, displayCount),
        });
      },

      searchPurchasesInDB: async (query: string) => {
        const { filteredPurchases } = get();

        if (filteredPurchases.length > 0 || !query.trim()) {
          return;
        }

        set({ isPaginating: true });

        try {
          const response = await api.get(
            `/purchases/search?q=${encodeURIComponent(query)}`
          );
          const results = response.data.purchases || [];

          const { allPurchases } = get();
          const existingIds = new Set(
            allPurchases.map(purchase => purchase.id)
          );
          const newPurchases = results.filter(
            (purchase: any) => !existingIds.has(purchase.id)
          );

          set({
            allPurchases: [...allPurchases, ...newPurchases],
            isPaginating: false,
          });

          get().applyFilters();
        } catch {
          set({ isPaginating: false });
        }
      },

      getPurchaseByPurchaseNumber: (
        purchaseNumber: string
      ): Purchase | undefined => {
        const { allPurchases } = get();

        return allPurchases.find(
          purchase => purchase.purchaseNumber === purchaseNumber
        );
      },

      updatePurchase: (purchaseId: string, updatedData: Partial<Purchase>) => {
        const { allPurchases } = get();
        const updatedPurchases = allPurchases.map(purchase =>
          purchase.id === purchaseId
            ? { ...purchase, ...updatedData }
            : purchase
        );

        set({
          allPurchases: updatedPurchases,
          lastFetchTime: Date.now(),
        });

        get().applyFilters();
      },

      addPurchase: (purchase: Purchase) => {
        const { allPurchases } = get();

        set({ allPurchases: [...allPurchases, purchase] });
        get().applyFilters();
      },

      deletePurchase: async (id: string) => {
        set({ isDeleting: true });
        try {
          await api.delete(`/purchases/${id}`);
          const { allPurchases } = get();
          const updatedPurchases = allPurchases.filter(
            purchase => purchase.id !== id
          );

          set({
            allPurchases: updatedPurchases,
            lastFetchTime: Date.now(),
            isDeleting: false,
          });
          get().applyFilters();
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      recordPayment: async (purchaseId: string, paymentData: any) => {
        const response = await api.post(
          `/purchases/${purchaseId}/payment`,
          paymentData
        );
        const updatedPurchase = response.data.purchase;

        get().updatePurchase(purchaseId, updatedPurchase);

        return updatedPurchase;
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshPurchases: async () => {
        await get().fetchPurchases(true);
      },

      reset: () => {
        set({
          allPurchases: [],
          displayedPurchases: [],
          filteredPurchases: [],
          isInitialLoading: false,
          isPaginating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          statusFilter: 'ALL',
          dateFilter: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'purchase-storage',
      partialize: state => ({
        allPurchases: state.allPurchases,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
