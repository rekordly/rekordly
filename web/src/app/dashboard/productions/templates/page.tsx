'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Package, CheckCircle, Plus } from 'lucide-react';
import { useRecipeStore } from '@/store/recipeStore';
import { ProductRecipe } from '@/types/production';
import { CreateProductTemplateDrawer } from '@/components/drawer/CreateProductTemplateDrawer';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { TemplateCard } from '@/components/ui/TemplateCard';
import { TEMPLATE_CATEGORIES } from '@/config/production-constants';

type TemplateStatus = 'ALL' | 'ACTIVE' | 'INACTIVE';

const STATUS_FILTERS = [
  { label: 'All Status', value: 'ALL', color: 'default' as const },
  { label: 'Active', value: 'ACTIVE', color: 'success' as const },
  { label: 'Inactive', value: 'INACTIVE', color: 'default' as const },
];

const CATEGORY_FILTERS = [
  { label: 'All Categories', value: 'ALL' },
  ...TEMPLATE_CATEGORIES.map(cat => ({ label: cat.label, value: cat.value })),
];

export default function ProductTemplatesPage() {
  const [filterValue, setFilterValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus>('ALL');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ProductRecipe | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { isLoading, allRecipes, fetchRecipes, deleteRecipe } =
    useRecipeStore();

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const filteredItems = React.useMemo(() => {
    let filtered = [...allRecipes];
    if (categoryFilter !== 'ALL') {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }
    if (statusFilter === 'ACTIVE') {
      filtered = filtered.filter(item => item.isActive);
    } else if (statusFilter === 'INACTIVE') {
      filtered = filtered.filter(item => !item.isActive);
    }
    if (filterValue) {
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.description?.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.category?.toLowerCase().includes(filterValue.toLowerCase())
      );
    }
    return filtered;
  }, [allRecipes, categoryFilter, statusFilter, filterValue]);

  const statistics = React.useMemo(() => {
    const totalTemplates = allRecipes.length;
    const activeTemplates = allRecipes.filter(item => item.isActive).length;
    const avgMaterialCost =
      allRecipes.length > 0
        ? allRecipes.reduce(
            (sum, item) => sum + ((item as any).totalMaterialCost || 0),
            0
          ) / allRecipes.length
        : 0;
    const totalIngredients = allRecipes.reduce(
      (sum, item) => sum + (item.ingredients?.length || 0),
      0
    );

    return {
      totalTemplates,
      activeTemplates,
      avgMaterialCost,
      totalIngredients,
    };
  }, [allRecipes]);

  const handleEdit = (item: ProductRecipe) => {
    setSelectedTemplate(item);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRecipe(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <UniversalListSkeleton gridConfig={{ default: 2, md: 2, lg: 3, xl: 4 }} />
    );
  }

  return (
    <>
      <UniversalListLayout<TemplateStatus, string>
        stats={[
          {
            gradient: true,
            description: `${statistics.activeTemplates} active out of ${statistics.totalTemplates} total templates`,
            gradientColor: 'primary',
            tag: 'Total Templates',
            tagColor: 'primary',
            title: `${statistics.totalTemplates}`,
            icon: <Layers size={24} />,
          },
          {
            gradient: true,
            description: 'Average material cost per template batch',
            gradientColor: 'success',
            tag: 'Avg Material Cost',
            tagColor: 'success',
            title: formatCurrency(statistics.avgMaterialCost),
            icon: <Package size={24} />,
          },
          {
            gradient: true,
            description: `Across all ${statistics.totalTemplates} templates`,
            gradientColor: 'warning',
            tag: 'Total Materials',
            tagColor: 'warning',
            title: `${statistics.totalIngredients}`,
            icon: <CheckCircle size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by name, description, or category..."
        onSearchChange={setFilterValue}
        onSearchClear={() => setFilterValue('')}
        statusFilters={STATUS_FILTERS}
        selectedStatus={statusFilter}
        onStatusChange={setStatusFilter}
        typeFilters={CATEGORY_FILTERS}
        selectedType={categoryFilter}
        onTypeChange={setCategoryFilter}
        onRefresh={() => fetchRecipes(true)}
        onAdd={() => setIsDrawerOpen(true)}
        addButtonText="Add Template"
        addButtonIcon={<Plus className="w-4 h-4" />}
        items={filteredItems.map(item => (
          <TemplateCard
            key={item.id}
            template={item}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deletingId === item.id}
          />
        ))}
        emptyMessage={
          filterValue || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
            ? 'No templates found'
            : 'No product templates yet. Create your first template to get started.'
        }
        gridConfig={{ default: 2, md: 2, lg: 3, xl: 4 }}
        currentCount={filteredItems.length}
        totalCount={filteredItems.length}
      />

      <CreateProductTemplateDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedTemplate(null);
        }}
        template={selectedTemplate}
      />
    </>
  );
}
