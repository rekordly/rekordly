// store/recipeStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import {
  RecipeStore,
  ProductRecipe,
  RecipeFormInput,
  RecipeWithDetails,
} from '@/types/production';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useRecipeStore = create<RecipeStore>()(
  persist(
    (set, get) => ({
      allRecipes: [] as ProductRecipe[],
      displayedRecipes: [] as ProductRecipe[],
      filteredRecipes: [] as ProductRecipe[],
      isLoading: false,
      isPaginating: false,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      error: null as string | null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      categoryFilter: null as string | null,
      activeFilter: 'ALL' as boolean | 'ALL',
      lastFetchTime: null as number | null,

      // Main fetch
      fetchRecipes: async (forceRefresh = false) => {
        const { lastFetchTime, allRecipes } = get();
        const now = Date.now();

        if (allRecipes.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allRecipes.length === 0 ||
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
          const response = await api.get('/recipes?limit=10000');
          const recipes = response.data.recipes || [];

          set({
            allRecipes: recipes,
            isLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch recipes',
            isLoading: false,
          });
        }
      },

      fetchRecipeById: async (id: string): Promise<RecipeWithDetails> => {
        try {
          const response = await api.get(`/recipes/${id}`);
          return response.data.recipe;
        } catch (error) {
          throw new Error('Failed to fetch recipe details');
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredRecipes } = get();

        if (displayCount >= filteredRecipes.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredRecipes.length
          );

          set({
            displayCount: newCount,
            displayedRecipes: filteredRecipes.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchRecipes: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setCategoryFilter: (category: string | null) => {
        set({ categoryFilter: category, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setActiveFilter: (active: boolean | 'ALL') => {
        set({ activeFilter: active, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allRecipes,
          searchQuery,
          categoryFilter,
          activeFilter,
          displayCount,
        } = get();

        let filtered = [...allRecipes];

        // Apply active filter
        if (activeFilter !== 'ALL') {
          filtered = filtered.filter(
            recipe => recipe.isActive === activeFilter
          );
        }

        // Apply category filter
        if (categoryFilter) {
          filtered = filtered.filter(
            recipe =>
              recipe.category?.toLowerCase() === categoryFilter.toLowerCase()
          );
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(recipe => {
            const name = recipe.name || '';
            const description = recipe.description || '';
            const category = recipe.category || '';

            return (
              name.toLowerCase().includes(lowerQuery) ||
              description.toLowerCase().includes(lowerQuery) ||
              category.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by name (A-Z)
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        set({
          filteredRecipes: filtered,
          displayedRecipes: filtered.slice(0, displayCount),
        });
      },

      resetFilters: () => {
        set({
          searchQuery: '',
          categoryFilter: null,
          activeFilter: 'ALL',
          displayCount: RENDER_LIMIT,
        });
        get().applyFilters();
      },

      getRecipeById: (id: string): ProductRecipe | undefined => {
        const { allRecipes } = get();
        return allRecipes.find(recipe => recipe.id === id);
      },

      getRecipeByOutputItemId: (itemId: string): ProductRecipe | undefined => {
        const { allRecipes } = get();
        return allRecipes.find(
          recipe => recipe.outputInventoryItemId === itemId
        );
      },

      // CRUD Operations
      createRecipe: async (recipe: FormData | RecipeFormInput) => {
        set({ isCreating: true, error: null });

        try {
          const response = await api.post('/recipes', recipe, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const newRecipe = response.data.recipe;

          const { allRecipes } = get();
          set({
            allRecipes: [...allRecipes, newRecipe],
            isCreating: false,
          });

          get().applyFilters();
          return newRecipe;
        } catch (error: any) {
          set({
            error: error?.response?.data?.message || 'Failed to create recipe',
            isCreating: false,
          });
          throw error;
        }
      },

      updateRecipe: async (
        id: string,
        updates: FormData | Partial<RecipeFormInput>
      ) => {
        set({ isUpdating: true, error: null });

        try {
          const response = await api.patch(`/recipes/${id}`, updates, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const updatedRecipe = response.data.recipe;

          const { allRecipes } = get();
          const updatedRecipes = allRecipes.map(recipe =>
            recipe.id === id ? updatedRecipe : recipe
          );

          set({
            allRecipes: updatedRecipes,
            isUpdating: false,
          });

          get().applyFilters();
          return updatedRecipe;
        } catch (error: any) {
          set({
            error: error?.response?.data?.message || 'Failed to update recipe',
            isUpdating: false,
          });
          throw error;
        }
      },

      deleteRecipe: async (id: string) => {
        set({ isDeleting: true, error: null });

        try {
          await api.delete(`/recipes/${id}`);

          const { allRecipes } = get();
          const updatedRecipes = allRecipes.filter(recipe => recipe.id !== id);

          set({
            allRecipes: updatedRecipes,
            isDeleting: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error: any) {
          set({
            error: error?.response?.data?.message || 'Failed to delete recipe',
            isDeleting: false,
          });
          throw error;
        }
      },

      refreshRecipes: async () => {
        await get().fetchRecipes(true);
      },

      reset: () => {
        set({
          allRecipes: [],
          displayedRecipes: [],
          filteredRecipes: [],
          isLoading: false,
          isPaginating: false,
          isCreating: false,
          isUpdating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          categoryFilter: null,
          activeFilter: 'ALL',
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'recipe-storage',
      partialize: state => ({
        allRecipes: state.allRecipes,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
