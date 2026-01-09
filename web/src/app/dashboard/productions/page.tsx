'use client';

import React, { useState, useEffect } from 'react';
import { Factory, DollarSign, CheckCircle, Plus } from 'lucide-react';
import { useProductionStore } from '@/store/productionStore';
import { Production } from '@/types/production';
import { CreateProductionDrawer } from '@/components/drawer/CreateProductionDrawer';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { ProductionCard } from '@/components/ui/ProductionCard';
import { PRODUCTION_STATUS_OPTIONS } from '@/config/production-constants';

type ProductionStatus =
  | 'ALL'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const STATUS_FILTERS = [
  { label: 'All Status', value: 'ALL', color: 'default' as const },
  ...PRODUCTION_STATUS_OPTIONS.map(s => ({
    label: s.label,
    value: s.value,
    color: 'default' as const,
  })),
];

export default function ProductionsPage() {
  const [filterValue, setFilterValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus>('ALL');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedProduction, setSelectedProduction] =
    useState<Production | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { isLoading, allProductions, fetchProductions, deleteProduction } =
    useProductionStore();

  useEffect(() => {
    fetchProductions();
  }, [fetchProductions]);

  const filteredItems = React.useMemo(() => {
    let filtered = [...allProductions];
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }
    if (filterValue) {
      filtered = filtered.filter(
        item =>
          item.outputItemName
            .toLowerCase()
            .includes(filterValue.toLowerCase()) ||
          item.productionNumber
            .toLowerCase()
            .includes(filterValue.toLowerCase()) ||
          item.title?.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.notes?.toLowerCase().includes(filterValue.toLowerCase())
      );
    }
    return filtered;
  }, [allProductions, statusFilter, filterValue]);

  const statistics = React.useMemo(() => {
    const totalProductions = allProductions.length;
    const completedCount = allProductions.filter(
      item => item.status === 'COMPLETED'
    ).length;
    const totalCost = allProductions
      .filter(item => item.status === 'COMPLETED')
      .reduce((sum, item) => sum + item.totalCost, 0);
    const inProgressCount = allProductions.filter(
      item => item.status === 'IN_PROGRESS'
    ).length;

    return { totalProductions, completedCount, totalCost, inProgressCount };
  }, [allProductions]);

  const handleEdit = (item: Production) => {
    setSelectedProduction(item);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteProduction(id);
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
      <UniversalListLayout<ProductionStatus>
        stats={[
          {
            gradient: true,
            description: `${statistics.completedCount} completed productions`,
            gradientColor: 'primary',
            tag: 'Total Productions',
            tagColor: 'primary',
            title: `${statistics.totalProductions}`,
            icon: <Factory size={24} />,
          },
          {
            gradient: true,
            description: 'Total cost of completed productions',
            gradientColor: 'warning',
            tag: 'Total Cost',
            tagColor: 'warning',
            title: formatCurrency(statistics.totalCost),
            icon: <DollarSign size={24} />,
          },
          {
            gradient: true,
            description: `${statistics.inProgressCount} in progress`,
            gradientColor: 'success',
            tag: 'Completed',
            tagColor: 'success',
            title: `${statistics.completedCount}`,
            icon: <CheckCircle size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by product name, production number, or notes..."
        onSearchChange={setFilterValue}
        onSearchClear={() => setFilterValue('')}
        statusFilters={STATUS_FILTERS}
        selectedStatus={statusFilter}
        onStatusChange={setStatusFilter}
        onRefresh={() => fetchProductions(true)}
        onAdd={() => setIsDrawerOpen(true)}
        addButtonText="Add Production"
        addButtonIcon={<Plus className="w-4 h-4" />}
        items={filteredItems.map(item => (
          <ProductionCard
            key={item.id}
            production={item}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deletingId === item.id}
          />
        ))}
        emptyMessage={
          filterValue || statusFilter !== 'ALL'
            ? 'No productions found'
            : 'No productions yet. Create your first production to get started.'
        }
        gridConfig={{ default: 2, md: 3, lg: 4, xl: 5 }}
        currentCount={filteredItems.length}
        totalCount={filteredItems.length}
      />

      <CreateProductionDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedProduction(null);
        }}
        production={selectedProduction}
      />
    </>
  );
}
