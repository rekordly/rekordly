import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import { SaleStore, Sale } from '@/types/sales';
import { SaleStatusType } from '@/types';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useSaleStore = create<SaleStore>()(
  persist(
    (set, get) => ({
      allSales: [] as Sale[],
      displayedSales: [] as Sale[],
      filteredSales: [] as Sale[],
      isInitialLoading: false,
      isPaginating: false,
      isDeleting: false,
      error: null as string | null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      statusFilter: 'ALL' as SaleStatusType | 'ALL',
      lastFetchTime: null as number | null,

      fetchSales: async (forceRefresh = false) => {
        const { lastFetchTime, allSales } = get();
        const now = Date.now();

        if (allSales.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allSales.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allSales.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/sales?limit=10000');
          const sales = response.data.sales || [];

          set({
            allSales: sales,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch {
          set({
            error: 'Failed to fetch sales',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredSales } = get();

        if (displayCount >= filteredSales.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredSales.length
          );

          set({
            displayCount: newCount,
            displayedSales: filteredSales.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchSales: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      searchSalesInDB: async (query: string) => {
        const { filteredSales } = get();

        if (filteredSales.length > 0 || !query.trim()) {
          return;
        }

        set({ isPaginating: true });

        try {
          const response = await api.get(
            `/sales/search?q=${encodeURIComponent(query)}`
          );
          const results = response.data.sales || [];

          const { allSales } = get();
          const existingIds = new Set(allSales.map(sale => sale.id));
          const newSales = results.filter(
            (sale: any) => !existingIds.has(sale.id)
          );

          set({
            allSales: [...allSales, ...newSales],
            isPaginating: false,
          });

          get().applyFilters();
        } catch {
          set({ isPaginating: false });
        }
      },

      setStatusFilter: (status: SaleStatusType | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const { allSales, searchQuery, statusFilter, displayCount } = get();

        let filtered = [...allSales];

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(sale => sale.status === statusFilter);
        }

        // Apply search filter (local search)
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(sale => {
            const customerName = sale.customer?.name || sale.customerName || '';
            const title = sale.title || '';
            const receiptNumber = sale.receiptNumber || '';
            const amount = sale.totalAmount.toString();

            return (
              customerName.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              receiptNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) =>
            new Date(b.saleDate as string | Date).getTime() -
            new Date(a.saleDate as string | Date).getTime()
        );

        set({
          filteredSales: filtered,
          displayedSales: filtered.slice(0, displayCount),
        });
      },

      getSaleByReceiptNumber: (receiptNumber: string): Sale | undefined => {
        const { allSales } = get();
        return allSales.find(sale => sale.receiptNumber === receiptNumber);
      },

      // ✅ Helper: Calculate total from saleItems
      getSaleItemsTotal: (saleId: string): number => {
        const { allSales } = get();
        const sale = allSales.find(s => s.id === saleId);

        if (!sale || !sale.saleItems || sale.saleItems.length === 0) {
          return 0;
        }

        return sale.saleItems.reduce(
          (sum: number, item: any) => sum + (item.amount || 0),
          0
        );
      },

      updateSale: (saleId: string, updatedData: Partial<Sale>) => {
        const { allSales } = get();
        const updatedSales = allSales.map(sale =>
          sale.id === saleId ? { ...sale, ...updatedData } : sale
        );

        set({
          allSales: updatedSales,
          lastFetchTime: Date.now(),
        });

        get().applyFilters();
      },

      addSale: (sale: Sale) => {
        const { allSales } = get();
        set({ allSales: [...allSales, sale] });
        get().applyFilters();
      },

      deleteSale: async (id: string) => {
        set({ isDeleting: true });

        try {
          await api.delete(`/sales/${id}`);

          const { allSales } = get();
          const updatedSales = allSales.filter(sale => sale.id !== id);

          set({
            allSales: updatedSales,
            lastFetchTime: Date.now(),
            isDeleting: false,
          });

          get().applyFilters();
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshSales: async () => {
        await get().fetchSales(true);
      },

      reset: () => {
        set({
          allSales: [],
          displayedSales: [],
          filteredSales: [],
          isInitialLoading: false,
          isPaginating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          statusFilter: 'ALL',
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'sale-storage',
      partialize: state => ({
        allSales: state.allSales,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
