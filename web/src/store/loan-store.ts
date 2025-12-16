import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { LoanStore, Loan, LoanType, LoanStatus } from '@/types/loan';
import { addToast } from '@heroui/react';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000;

export const useLoanStore = create<LoanStore>()(
  persist(
    (set, get) => ({
      allLoans: [],
      displayedLoans: [],
      filteredLoans: [],
      summary: null,
      chartData: null,
      meta: null,
      isInitialLoading: false,
      isPaginating: false,
      isDeleting: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      typeFilter: 'ALL',
      statusFilter: 'ALL',
      lastFetchTime: null,

      fetchLoans: async (forceRefresh = false) => {
        const { lastFetchTime, allLoans } = get();
        const now = Date.now();

        if (allLoans.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allLoans.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allLoans.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/loans');
          console.log('Fetched loans:', response.data.loans);

          // ✅ FIX: API returns `loans` not `data`
          const { loans, summary, chartData, meta } = response.data;

          set({
            allLoans: loans || [],
            summary,
            chartData,
            meta,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          console.error('Fetch loans error:', error);
          set({
            error: 'Failed to fetch loans',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredLoans } = get();

        if (displayCount >= filteredLoans.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredLoans.length
          );

          set({
            displayCount: newCount,
            displayedLoans: filteredLoans.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchLoans: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setTypeFilter: (type: LoanType | 'ALL') => {
        set({ typeFilter: type, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setStatusFilter: (status: LoanStatus | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allLoans,
          searchQuery,
          typeFilter,
          statusFilter,
          displayCount,
        } = get();

        let filtered = [...allLoans];

        // Apply type filter
        if (typeFilter !== 'ALL') {
          filtered = filtered.filter(loan => loan.loanType === typeFilter);
        }

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(loan => loan.status === statusFilter);
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(loan => {
            const loanNumber = loan.loanNumber || '';
            const partyName = loan.partyName || '';
            const purpose = loan.purpose || '';
            const amount = loan.principalAmount.toString();
            const balance = loan.currentBalance.toString();

            return (
              loanNumber.toLowerCase().includes(lowerQuery) ||
              partyName.toLowerCase().includes(lowerQuery) ||
              purpose.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery) ||
              balance.includes(lowerQuery)
            );
          });
        }
        // Sort by date (newest first)
        filtered.sort(
          (a, b) =>
            new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );

        set({
          filteredLoans: filtered,
          displayedLoans: filtered.slice(0, displayCount),
        });
      },

      updateLoan: (loanId: string, updatedData: Partial<Loan>) => {
        const { allLoans } = get();
        const updatedLoan = allLoans.map(loan =>
          loan.id === loanId ? { ...loan, ...updatedData } : loan
        );

        set({
          allLoans: updatedLoan,
          lastFetchTime: Date.now(),
        });

        get().applyFilters();
      },

      addLoan: (loan: Loan) => {
        const { allLoans } = get();

        set({ allLoans: [loan, ...allLoans] });
        get().applyFilters();
      },

      deleteLoan: async (id: string) => {
        set({ isDeleting: true });
        try {
          await api.delete(`/loans/${id}`);

          const { allLoans } = get();
          const updatedLoans = allLoans.filter(loan => loan.id !== id);

          set({
            allLoans: updatedLoans,
            lastFetchTime: Date.now(),
            isDeleting: false,
          });

          get().applyFilters();

          addToast({
            title: 'Success',
            description: 'Loan deleted successfully',
            color: 'success',
          });
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshLoans: async () => {
        await get().fetchLoans(true);
      },

      reset: () => {
        set({
          allLoans: [],
          displayedLoans: [],
          filteredLoans: [],
          summary: null,
          chartData: null,
          meta: null,
          isInitialLoading: false,
          isPaginating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          typeFilter: 'ALL',
          statusFilter: 'ALL',
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'loan-storage',
      partialize: state => ({
        allLoans: state.allLoans,
        summary: state.summary,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
