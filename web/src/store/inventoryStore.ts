import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import {
  InventoryStore,
  InventoryItem,
  InventoryItemInput,
  StockAdjustment,
  StockAdjustmentInput,
  InventoryType,
  StorefrontInventoryItem,
} from '@/types/inventory';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useInventoryStore = create<InventoryStore>()(
  persist(
    (set, get) => ({
      allInventory: [] as InventoryItem[],
      storefrontItems: [] as StorefrontInventoryItem[],
      filteredInventory: [] as InventoryItem[],
      displayedInventory: [] as InventoryItem[],

      isInitialLoading: false,
      isPaginating: false,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      isAdjusting: false,

      error: null as string | null,
      searchQuery: '',

      displayCount: RENDER_LIMIT,
      itemTypeFilter: 'ALL' as InventoryType | 'ALL',
      showOnStorefrontFilter: 'ALL' as boolean | 'ALL',
      isActiveFilter: 'ALL' as boolean | 'ALL',

      lastFetchTime: null,

      // Computed property
      get isLoading() {
        const state = get();
        return (
          state.isInitialLoading ||
          state.isCreating ||
          state.isUpdating ||
          state.isDeleting ||
          state.isAdjusting
        );
      },

      // Main fetch - matches the interface name
      fetchInventory: async (forceRefresh = false) => {
        const { lastFetchTime, allInventory } = get();
        const now = Date.now();

        if (allInventory.length > 0) {
          get().applyFilters();
        }

        console.log('Last fetch time:', lastFetchTime);
        const shouldFetch =
          forceRefresh ||
          allInventory.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        console.log('Should Fetch:', shouldFetch);

        if (!shouldFetch) {
          return;
        }
        set({
          isInitialLoading: allInventory.length === 0,
          error: null,
        });

        try {
          const response = await api.get(`/inventory-items?limit=10000`);
          const inventory = response.data.inventoryItems || [];
          console.log(
            'Fetched inventory items:',
            JSON.stringify(inventory, null, 2)
          );

          set({
            allInventory: inventory,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
          console.log('Updated fetch at:', lastFetchTime);
        } catch {
          set({
            error: 'Failed to fetch inventory items',
            isInitialLoading: false,
          });
        }
      },

      // Fixed parameter order: filters first, then forceRefresh
      fetchInventoryItems: async (
        filters?: {
          itemType?: InventoryType | 'ALL';
          showOnStorefront?: boolean | 'ALL';
          isActive?: boolean | 'ALL';
          category?: string;
          lowStock?: boolean;
        },
        forceRefresh = false
      ) => {
        const { lastFetchTime, allInventory } = get();
        const now = Date.now();

        if (allInventory.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allInventory.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allInventory.length === 0,
          error: null,
        });

        try {
          const queryParams = new URLSearchParams();

          if (filters?.itemType && filters.itemType !== 'ALL') {
            queryParams.append('itemType', filters.itemType);
          }
          if (
            filters?.showOnStorefront !== undefined &&
            filters.showOnStorefront !== 'ALL'
          ) {
            queryParams.append(
              'showOnStorefront',
              filters.showOnStorefront.toString()
            );
          }
          if (filters?.isActive !== undefined && filters.isActive !== 'ALL') {
            queryParams.append('isActive', filters.isActive.toString());
          }
          if (filters?.category) {
            queryParams.append('category', filters.category);
          }
          if (filters?.lowStock) {
            queryParams.append('lowStock', 'true');
          }

          const queryString = queryParams.toString();
          const response = await api.get(
            `/inventory-items?limit=10000${queryString ? '&' + queryString : ''}`
          );

          const inventory = response.data.inventoryItems || [];

          set({
            allInventory: inventory,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch {
          set({
            error: 'Failed to fetch inventory items',
            isInitialLoading: false,
          });
        }
      },

      // Storefront fetch
      fetchStorefrontItems: async (filters?: {
        itemType?: InventoryType | 'ALL';
        category?: string;
        search?: string;
      }) => {
        set({ isInitialLoading: true, error: null });

        try {
          const queryParams = new URLSearchParams();

          if (filters?.itemType && filters.itemType !== 'ALL') {
            queryParams.append('itemType', filters.itemType);
          }
          if (filters?.category) {
            queryParams.append('category', filters.category);
          }
          if (filters?.search) {
            queryParams.append('search', filters.search);
          }

          const queryString = queryParams.toString();
          const response = await api.get(
            `/inventory-items/storefront?limit=10000${queryString ? '&' + queryString : ''}`
          );

          const storefrontItems = response.data.inventoryItems || [];

          set({
            storefrontItems,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });
        } catch {
          set({
            error: 'Failed to fetch storefront items',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredInventory } = get();

        if (displayCount >= filteredInventory.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredInventory.length
          );

          set({
            displayCount: newCount,
            displayedInventory: filteredInventory.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchInventory: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      // Add searchInventoryInDB method required by interface
      searchInventoryInDB: async (query: string) => {
        set({ isInitialLoading: true, error: null, searchQuery: query });

        try {
          const queryParams = new URLSearchParams();
          if (query.trim()) {
            queryParams.append('search', query.trim());
          }

          const queryString = queryParams.toString();
          const response = await api.get(
            `/inventory-items?limit=10000${queryString ? '&' + queryString : ''}`
          );

          const inventory = response.data.inventoryItems || [];

          set({
            allInventory: inventory,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch {
          set({
            error: 'Failed to search inventory items',
            isInitialLoading: false,
          });
        }
      },

      applyFilters: () => {
        const {
          allInventory,
          searchQuery,
          displayCount,
          itemTypeFilter,
          showOnStorefrontFilter,
          isActiveFilter,
        } = get();

        let filtered = [...allInventory];

        // Apply item type filter
        if (itemTypeFilter !== 'ALL') {
          filtered = filtered.filter(item => item.itemType === itemTypeFilter);
        }

        // Apply storefront filter
        if (showOnStorefrontFilter !== 'ALL') {
          filtered = filtered.filter(
            item => item.showOnStorefront === showOnStorefrontFilter
          );
        }

        // Apply active filter
        if (isActiveFilter !== 'ALL') {
          filtered = filtered.filter(item => item.isActive === isActiveFilter);
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(item => {
            const name = item.name || '';
            const sku = item.sku || '';
            const category = item.category || '';

            return (
              name.toLowerCase().includes(lowerQuery) ||
              sku.toLowerCase().includes(lowerQuery) ||
              category.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by name (ascending)
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        set({
          filteredInventory: filtered,
          displayedInventory: filtered.slice(0, displayCount),
        });
      },

      // Filter actions
      setItemTypeFilter: (type: InventoryType | 'ALL') => {
        set({ itemTypeFilter: type, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setShowOnStorefrontFilter: (show: boolean | 'ALL') => {
        set({ showOnStorefrontFilter: show, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setIsActiveFilter: (active: boolean | 'ALL') => {
        set({ isActiveFilter: active, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      resetFilters: () => {
        set({
          itemTypeFilter: 'ALL',
          showOnStorefrontFilter: 'ALL',
          isActiveFilter: 'ALL',
          displayCount: RENDER_LIMIT,
        });
        get().applyFilters();
      },

      // CRUD Operations
      getItemById: (id: string): InventoryItem | undefined => {
        const { allInventory } = get();
        return allInventory.find(item => item.id === id);
      },

      createInventoryItem: async (formData: FormData) => {
        set({ isCreating: true, error: null });

        try {
          const response = await api.post('/inventory-items', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const newItem = response.data.inventoryItem;

          const { allInventory } = get();
          set({
            allInventory: [...allInventory, newItem],
            isCreating: false,
          });

          get().applyFilters();
          return newItem; // Return the created item
        } catch (error) {
          set({
            error: 'Failed to create inventory item',
            isCreating: false,
          });
          throw error;
        }
      },

      updateInventoryItem: async (id: string, formData: FormData) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch(`/inventory-items/${id}`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const updatedItem = response.data.inventoryItem;

          const { allInventory } = get();
          const updatedItems = allInventory.map(item =>
            item.id === id ? updatedItem : item
          );

          set({
            allInventory: updatedItems,
            isUpdating: false,
          });

          get().applyFilters();
          return updatedItem;
        } catch (error) {
          set({
            error: 'Failed to update inventory item',
            isUpdating: false,
          });
          throw error;
        }
      },

      createStockAdjustment: async (adjustment: StockAdjustmentInput) => {
        set({ isAdjusting: true, error: null });

        try {
          const response = await api.post(
            `/inventory-items/${adjustment.inventoryItemId}/adjust`,
            adjustment
          );
          const updatedItem = response.data.inventoryItem;

          const { allInventory } = get();
          const updatedItems = allInventory.map(item =>
            item.id === adjustment.inventoryItemId ? updatedItem : item
          );

          set({
            allInventory: updatedItems,
            isAdjusting: false,
          });

          get().applyFilters();
          return updatedItem; // Return the updated item
        } catch (error) {
          set({
            error: 'Failed to create stock adjustment',
            isAdjusting: false,
          });
          throw error;
        }
      },

      deleteInventoryItem: async (id: string) => {
        set({ isDeleting: true, error: null });

        try {
          await api.delete(`/inventory-items/${id}`);

          const { allInventory } = get();
          const updatedItems = allInventory.filter(item => item.id !== id);

          set({
            allInventory: updatedItems,
            isDeleting: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      // Stock availability check
      checkStockAvailability: (itemId: string, quantity: number): boolean => {
        const { allInventory } = get();
        const item = allInventory.find(i => i.id === itemId);

        if (!item || !item.trackInventory) {
          return true; // Allow if not tracking inventory
        }

        // Check if quantity on hand is sufficient
        return item.quantityOnHand >= quantity;
      },

      refreshInventory: async () => {
        await get().fetchInventory(true);
      },

      reset: () => {
        set({
          allInventory: [],
          storefrontItems: [],
          filteredInventory: [],
          displayedInventory: [],

          isInitialLoading: false,
          isPaginating: false,
          isCreating: false,
          isUpdating: false,
          isDeleting: false,
          isAdjusting: false,

          error: null,
          searchQuery: '',

          displayCount: RENDER_LIMIT,
          itemTypeFilter: 'ALL',
          showOnStorefrontFilter: 'ALL',
          isActiveFilter: 'ALL',

          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'inventory-storage',
      partialize: state => ({
        allInventory: state.allInventory,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
