'use client';

import React, { useState, useEffect } from 'react';
import { Package, DollarSign, TrendingUp, Plus } from 'lucide-react';
import { useInventoryStore } from '@/store/inventoryStore';
import { InventoryCard } from '@/components/ui/InventoryCard';
import { CreateInventoryDrawer } from '@/components/drawer/CreateInventoryDrawer';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { ITEM_TYPE_FILTERS } from '@/config/constant';

type ItemTypeFilter =
  | 'ALL'
  | 'RAW_MATERIAL'
  | 'FINISHED_GOOD'
  | 'SERVICE'
  | 'PRODUCED_ITEM'
  | 'CONSUMABLE';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'LOW_STOCK';

const STATUS_FILTERS = [
  {
    label: 'All Status',
    value: 'ALL' as StatusFilter,
    color: 'default' as const,
  },
  {
    label: 'Active',
    value: 'ACTIVE' as StatusFilter,
    color: 'success' as const,
  },
  {
    label: 'Inactive',
    value: 'INACTIVE' as StatusFilter,
    color: 'default' as const,
  },
  {
    label: 'Low Stock',
    value: 'LOW_STOCK' as StatusFilter,
    color: 'warning' as const,
  },
];

export default function InventoryPage() {
  const [filterValue, setFilterValue] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { isLoading, allInventory, fetchInventory, deleteInventoryItem } =
    useInventoryStore();

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const filteredItems = React.useMemo(() => {
    let filtered = [...allInventory];

    if (itemTypeFilter !== 'ALL') {
      filtered = filtered.filter(item => item.itemType === itemTypeFilter);
    }

    if (statusFilter === 'ACTIVE') {
      filtered = filtered.filter(item => item.isActive);
    } else if (statusFilter === 'INACTIVE') {
      filtered = filtered.filter(item => !item.isActive);
    } else if (statusFilter === 'LOW_STOCK') {
      filtered = filtered.filter(
        item =>
          item.trackInventory &&
          item.reorderLevel &&
          item.quantityOnHand <= item.reorderLevel
      );
    }

    if (filterValue) {
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.sku?.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.category?.toLowerCase().includes(filterValue.toLowerCase())
      );
    }

    return filtered;
  }, [allInventory, itemTypeFilter, statusFilter, filterValue]);

  const statistics = React.useMemo(() => {
    const totalItems = allInventory.length;
    const activeItems = allInventory.filter(item => item.isActive).length;
    const totalValue = allInventory.reduce(
      (sum, item) => sum + item.quantityOnHand * item.averageCost,
      0
    );
    const lowStockItems = allInventory.filter(
      item =>
        item.trackInventory &&
        item.reorderLevel &&
        item.quantityOnHand <= item.reorderLevel
    ).length;

    return { totalItems, activeItems, totalValue, lowStockItems };
  }, [allInventory]);

  const handleEdit = (item: any) => {
    setSelectedInventory(item);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteInventoryItem(id);
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
      <UniversalListLayout<StatusFilter, ItemTypeFilter>
        stats={[
          {
            gradient: true,
            description: `${statistics.activeItems} active out of ${statistics.totalItems} total items`,
            gradientColor: 'primary',
            tag: 'Total Items',
            tagColor: 'primary',
            title: `${statistics.totalItems}`,
            icon: <Package size={24} />,
          },
          {
            gradient: true,
            description:
              'Total value of inventory on hand based on average cost',
            gradientColor: 'success',
            tag: 'Total Value',
            tagColor: 'success',
            title: formatCurrency(statistics.totalValue),
            icon: <DollarSign size={24} />,
          },
          {
            gradient: true,
            description: `${statistics.lowStockItems} items need reordering`,
            gradientColor: 'warning',
            tag: 'Low Stock Items',
            tagColor: 'warning',
            title: `${statistics.lowStockItems}`,
            icon: <TrendingUp size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by name, SKU, or category..."
        onSearchChange={setFilterValue}
        onSearchClear={() => setFilterValue('')}
        statusFilters={STATUS_FILTERS}
        selectedStatus={statusFilter}
        onStatusChange={setStatusFilter}
        typeFilters={ITEM_TYPE_FILTERS}
        selectedType={itemTypeFilter}
        onTypeChange={setItemTypeFilter}
        onRefresh={fetchInventory}
        onAdd={() => setIsDrawerOpen(true)}
        addButtonText="Add Item"
        addButtonIcon={<Plus className="w-4 h-4" />}
        leftContent={
          <span className="text-sm text-default-500">
            {filteredItems.length} items
          </span>
        }
        items={filteredItems.map(item => (
          <InventoryCard
            key={item.id}
            item={item}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deletingId === item.id}
            variant="minimal"
          />
        ))}
        emptyMessage={
          filterValue || itemTypeFilter !== 'ALL' || statusFilter !== 'ALL'
            ? 'No inventory items found'
            : 'No inventory items yet. Create your first item to get started.'
        }
        emptyActionText="Create First Item"
        onEmptyAction={() => setIsDrawerOpen(true)}
        gridConfig={{ default: 2, md: 2, lg: 3, xl: 4 }}
        currentCount={filteredItems.length}
        totalCount={filteredItems.length}
      />

      <CreateInventoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedInventory(null);
        }}
        inventoryItem={selectedInventory}
      />
    </>
  );
}
