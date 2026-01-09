// store/overview-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { OverviewStore } from '@/types/overview';

const CACHE_DURATION = 5 * 60 * 1000;

export const useOverviewStore = create<OverviewStore>()(
  persist(
    (set, get) => ({
      overview: null,
      chartData: null,
      meta: null,
      isLoading: false,
      error: null,
      lastFetchTime: null,

      fetchOverview: async (forceRefresh = false) => {
        const { lastFetchTime } = get();
        const now = Date.now();

        const shouldFetch =
          forceRefresh ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await api.get('/reports/overview');
          console.log('Overview data:', response.data);
          const { overview, chartData, meta } = response.data;

          set({
            overview,
            chartData,
            meta,
            isLoading: false,
            lastFetchTime: Date.now(),
          });
        } catch (error) {
          set({
            error: 'Failed to fetch financial overview',
            isLoading: false,
          });
        }
      },

      refreshOverview: async () => {
        await get().fetchOverview(true);
      },

      reset: () => {
        set({
          overview: null,
          chartData: null,
          meta: null,
          isLoading: false,
          error: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'overview-storage',
      partialize: state => ({
        overview: state.overview,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
