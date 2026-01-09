// store/productionStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseDate, CalendarDate } from '@internationalized/date';

import { api } from '@/lib/axios';
import {
  ProductionStore,
  Production,
  ProductionFormInput,
  ProductionStatusType,
  MaterialAvailability,
} from '@/types/production';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to convert DateValue to Date
const dateValueToDate = (dateValue: any): Date => {
  if (!dateValue) return new Date();
  if (dateValue instanceof Date) return dateValue;
  if (dateValue.year && dateValue.month && dateValue.day) {
    return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
  }
  return new Date(dateValue);
};

export const useProductionStore = create<ProductionStore>()(
  persist(
    (set, get) => ({
      allProductions: [] as Production[],
      displayedProductions: [] as Production[],
      filteredProductions: [] as Production[],
      isLoading: false,
      isPaginating: false,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      error: null as string | null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      statusFilter: 'ALL' as ProductionStatusType | 'ALL',
      saleIdFilter: null as string | null,
      lastFetchTime: null as number | null,

      // Main fetch
      fetchProductions: async (
        forceRefresh = false,
        filters?: {
          status?: ProductionStatusType | 'ALL';
          saleId?: string;
          startDate?: Date | CalendarDate;
          endDate?: Date | CalendarDate;
        }
      ) => {
        const { lastFetchTime, allProductions } = get();
        const now = Date.now();

        if (allProductions.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allProductions.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isLoading: true,
          error: null,
        });

        try {
          // Build query params
          const queryParams = new URLSearchParams();

          if (filters?.status && filters.status !== 'ALL') {
            queryParams.append('status', filters.status);
          }
          if (filters?.saleId) {
            queryParams.append('saleId', filters.saleId);
          }
          if (filters?.startDate) {
            const startDate = dateValueToDate(filters.startDate);
            queryParams.append('startDate', startDate.toISOString());
          }
          if (filters?.endDate) {
            const endDate = dateValueToDate(filters.endDate);
            queryParams.append('endDate', endDate.toISOString());
          }

          const queryString = queryParams.toString();
          const response = await api.get(
            `/productions?limit=10000${queryString ? '&' + queryString : ''}`
          );
          const productions = response.data.productions || [];

          set({
            allProductions: productions,
            isLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch productions',
            isLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredProductions } = get();

        if (displayCount >= filteredProductions.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredProductions.length
          );

          set({
            displayCount: newCount,
            displayedProductions: filteredProductions.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchProductions: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      searchProductionsInDB: async (query: string) => {
        set({ isLoading: true, error: null, searchQuery: query });

        try {
          const response = await api.get(
            `/productions/search?q=${encodeURIComponent(query)}`
          );
          const productions = response.data.productions || [];

          set({
            allProductions: productions,
            isLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to search productions',
            isLoading: false,
          });
        }
      },

      setStatusFilter: (status: ProductionStatusType | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setSaleIdFilter: (saleId: string | null) => {
        set({ saleIdFilter: saleId, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allProductions,
          searchQuery,
          statusFilter,
          saleIdFilter,
          displayCount,
        } = get();

        let filtered = [...allProductions];

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(
            production => production.status === statusFilter
          );
        }

        // Apply sale ID filter
        if (saleIdFilter) {
          filtered = filtered.filter(
            production => production.saleId === saleIdFilter
          );
        }

        // Apply search filter (local search)
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(production => {
            const title = production.title || '';
            const outputItemName = production.outputItemName || '';
            const productionNumber = production.productionNumber || '';

            return (
              title.toLowerCase().includes(lowerQuery) ||
              outputItemName.toLowerCase().includes(lowerQuery) ||
              productionNumber.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) =>
            new Date(b.productionDate as string | Date).getTime() -
            new Date(a.productionDate as string | Date).getTime()
        );

        set({
          filteredProductions: filtered,
          displayedProductions: filtered.slice(0, displayCount),
        });
      },

      resetFilters: () => {
        set({
          searchQuery: '',
          statusFilter: 'ALL',
          saleIdFilter: null,
          displayCount: RENDER_LIMIT,
        });
        get().applyFilters();
      },

      getProductionByProductionNumber: (
        productionNumber: string
      ): Production | undefined => {
        const { allProductions } = get();
        return allProductions.find(
          production => production.productionNumber === productionNumber
        );
      },

      getProductionById: (id: string): Production | undefined => {
        const { allProductions } = get();
        return allProductions.find(production => production.id === id);
      },

      // CRUD Operations
      createProduction: async (production: ProductionFormInput | FormData) => {
        set({ isCreating: true, error: null });

        try {
          const response = await api.post('/productions', production, {
            headers: {
              'Content-Type': 'multipart/formm-data',
            },
          });
          const newProduction = response.data.production;

          const { allProductions } = get();
          set({
            allProductions: [...allProductions, newProduction],
            isCreating: false,
          });

          get().applyFilters();
          return newProduction;
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to create production',
            isCreating: false,
          });
          throw error;
        }
      },

      updateProduction: async (
        id: string,
        updates: Partial<Production> | FormData
      ) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch(`/productions/${id}`, updates, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const updatedProduction = response.data.production;

          const { allProductions } = get();
          const updatedProductions = allProductions.map(production =>
            production.id === id ? updatedProduction : production
          );

          set({
            allProductions: updatedProductions,
            isUpdating: false,
          });

          get().applyFilters();
          return updatedProduction;
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to update production',
            isUpdating: false,
          });
          throw error;
        }
      },

      deleteProduction: async (id: string) => {
        set({ isDeleting: true, error: null });

        try {
          await api.delete(`/productions/${id}`);

          const { allProductions } = get();
          const updatedProductions = allProductions.filter(
            production => production.id !== id
          );

          set({
            allProductions: updatedProductions,
            isDeleting: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error: any) {
          set({
            error:
              error?.response?.data?.message || 'Failed to delete production',
            isDeleting: false,
          });
          throw error;
        }
      },

      refreshProductions: async () => {
        await get().fetchProductions(true);
      },

      reset: () => {
        set({
          allProductions: [],
          displayedProductions: [],
          filteredProductions: [],
          isLoading: false,
          isPaginating: false,
          isCreating: false,
          isUpdating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          statusFilter: 'ALL',
          saleIdFilter: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'production-storage',
      partialize: state => ({
        allProductions: state.allProductions,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);

// ============================================
// HELPER FUNCTIONS FOR PRODUCTION
// ============================================

/**
 * Check material availability for production
 */
export async function checkMaterialAvailability(
  materials: Array<{ inventoryItemId: string; requiredQuantity: number }>
): Promise<MaterialAvailability[]> {
  try {
    const response = await api.post('/productions/check-materials', {
      materials,
    });
    return response.data.availability;
  } catch (error) {
    console.error('Failed to check material availability:', error);
    throw error;
  }
}

/**
 * Calculate production costs from recipe and batch multiplier
 */
export async function calculateProductionCosts(
  recipeId: string,
  batchMultiplier: number = 1
) {
  try {
    const response = await api.post('/productions/calculate-costs', {
      recipeId,
      batchMultiplier,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to calculate production costs:', error);
    throw error;
  }
}
