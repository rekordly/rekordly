'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Card,
  CardBody,
  addToast,
} from '@heroui/react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  Filter,
  TrendingUp,
  Plus,
  Wallet,
} from 'lucide-react';
import { useIncomeStore } from '@/store/income-store';
import { Income } from '@/types/income';
import { IncomeCard } from '@/components/ui/IncomeCard';
import { OtherIncomeModal } from '@/components/modals/OtherIncomeModal';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { CreateQuotationDrawer } from '@/components/drawer/CreateQuotationDrawer';
import { CreateSaleDrawer } from '@/components/drawer/CreateSaleDrawer';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';

const SOURCE_FILTERS = [
  { label: 'All Sources', value: 'ALL' },
  { label: 'Sales', value: 'SALE' },
  { label: 'Quotations', value: 'QUOTATION' },
  { label: 'Other Income', value: 'OTHER_INCOME' },
];

export default function IncomeList() {
  const [filterValue, setFilterValue] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);
  const [isIncomeDrawerOpen, setIsIncomeDrawerOpen] = useState(false);
  const [editQuotationId, setEditQuotationId] = useState<string | null>(null);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editIncomeId, setEditIncomeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    displayedIncome,
    filteredIncome,
    isInitialLoading,
    isPaginating,
    isDeleting,
    summary,
    fetchIncome,
    loadMoreDisplayed,
    searchIncome,
    setSourceFilter: setStoreSourceFilter,
    deleteIncome,
    clearSearch,
  } = useIncomeStore();

  useEffect(() => {
    fetchIncome();
  }, [fetchIncome]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchIncome(true);
    setIsRefreshing(false);
  };

  const handleIncomeDrawerClose = () => {
    setIsIncomeDrawerOpen(false);
    setEditIncomeId(null);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditQuotationId(null);
    setEditSaleId(null);
    handleManualRefresh();
  };

  const handleEdit = (income: Income) => {
    if (income.sourceType === 'OTHER_INCOME') {
      setEditIncomeId(income.sourceId);
      setIsIncomeDrawerOpen(true);
    } else if (income.sourceType === 'SALE' && income.sourceId) {
      setEditSaleId(income.sourceId);
      setIsModalOpen(true);
    } else if (income.sourceType === 'QUOTATION' && income.sourceId) {
      setEditQuotationId(income.sourceId);
      setIsModalOpen(true);
    }
  };

  const handleDelete = async (
    id: string,
    sourceType: string,
    sourceId: string | null
  ) => {
    try {
      await deleteIncome(id, sourceType as any, sourceId);
      addToast({
        title: 'Success',
        description: 'Income deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      //   addToast({
      //     title: 'Error',
      //     description:
      //       error?.response?.data?.message || 'Failed to delete income',
      //     color: 'danger',
      //   });
    }
  };

  const onSearchChange = useCallback(
    (value: string) => {
      setFilterValue(value);
      searchIncome(value);
    },
    [searchIncome]
  );

  const handleSourceFilterChange = (source: string) => {
    setSourceFilter(source);
    setStoreSourceFilter(source as any);
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const bottom = documentHeight - scrollPosition <= 100;

      if (
        bottom &&
        !isPaginating &&
        displayedIncome.length < filteredIncome.length
      ) {
        loadMoreDisplayed();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [
    isPaginating,
    displayedIncome.length,
    filteredIncome.length,
    loadMoreDisplayed,
  ]);

  // Get top sources for description
  const getTopSourcesDescription = () => {
    if (!summary) return '';

    const sortedSources = Object.entries(summary.bySource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (sortedSources.length === 0) return 'No income sources yet';

    const topSourceName = sortedSources[0][0].replace('_', ' ').toLowerCase();
    const topSourceAmount = formatCurrency(sortedSources[0][1]);

    if (sortedSources.length === 1) {
      return `Your primary income source is ${topSourceName} generating ${topSourceAmount} in total revenue`;
    }

    const otherSources = sortedSources
      .slice(1)
      .map(([name]) => name.replace('_', ' ').toLowerCase())
      .join(' and ');

    return `Leading with ${topSourceName} at ${topSourceAmount}, followed by ${otherSources} as secondary income streams`;
  };

  const topContent = (
    <div className="flex flex-col gap-4">
      {/* Mobile: Single row with search and filters */}
      <div className="flex gap-2 items-center md:hidden">
        <Input
          isClearable
          classNames={{
            base: 'flex-1 min-w-0',
            inputWrapper: 'border-1 h-9 rounded-xl',
          }}
          placeholder="Search..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={() => {
            setFilterValue('');
            clearSearch();
          }}
          onValueChange={onSearchChange}
        />

        <Dropdown>
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="flat" className="h-9 w-9">
              <Filter className="w-4 h-4" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Filters">
            <DropdownItem key="filters" isReadOnly className="cursor-default">
              <div className="flex flex-col gap-3 py-2">
                <div>
                  <p className="text-xs md:text-sm font-semibold mb-2">
                    Source
                  </p>
                  <div className="flex flex-col gap-1">
                    {SOURCE_FILTERS.map(filter => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={
                          sourceFilter === filter.value ? 'flat' : 'light'
                        }
                        className="justify-start"
                        onPress={() => handleSourceFilterChange(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          className={isRefreshing ? 'animate-spin' : ''}
          size="sm"
          variant="bordered"
          isDisabled={isRefreshing}
          onPress={handleManualRefresh}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button
          isIconOnly
          size="sm"
          color="primary"
          onPress={() => setIsIncomeDrawerOpen(true)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Desktop: Full layout */}
      <div className="hidden md:flex justify-between gap-3 items-end">
        <Input
          isClearable
          classNames={{
            base: 'w-full sm:max-w-[44%]',
            inputWrapper: 'border-1 h-10 rounded-xl',
          }}
          placeholder="Search by customer, title, or amount..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={() => {
            setFilterValue('');
            clearSearch();
          }}
          onValueChange={onSearchChange}
        />
        <div className="flex gap-3">
          <Button
            isIconOnly
            className={isRefreshing ? 'animate-spin' : ''}
            size="sm"
            variant="bordered"
            isDisabled={isRefreshing}
            onPress={handleManualRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Dropdown>
            <DropdownTrigger>
              <Button
                endContent={<ChevronDown className="w-4 h-4" />}
                size="sm"
                variant="bordered"
              >
                {SOURCE_FILTERS.find(f => f.value === sourceFilter)?.label ||
                  'Source'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Source filter"
              selectedKeys={new Set([sourceFilter])}
              selectionMode="single"
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                handleSourceFilterChange(selected);
              }}
            >
              {SOURCE_FILTERS.map(filter => (
                <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          <Button
            size="sm"
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => setIsIncomeDrawerOpen(true)}
          >
            Add Income
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Summary Stats */}
      {summary && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <StatCard
            gradient
            description={`Your business recorded a gross revenue of ${formatCurrency(summary.grossRevenue)}. After ${formatCurrency(summary.totalRefunds)} in refunds, your net income is ${formatCurrency(summary.netIncome)}   with ${formatCurrency(summary.outstandingBalance)} still outstanding from customers.`}
            gradientColor="success"
            tag="Net Income"
            tagColor="success"
            title={formatCurrency(summary.netIncome)}
            icon={<Wallet size={24} />}
          />

          <StatCard
            gradient
            description={`Consistent monthly earnings of ${formatCurrency(summary.averagePerMonth)} generated from ${Object.keys(summary.bySource).length} diverse revenue streams, demonstrating stable business performance and balanced income distribution`}
            gradientColor="primary"
            tag="Average Income/Month"
            tagColor="primary"
            title={formatCurrency(summary.averagePerMonth)}
            icon={<TrendingUp size={24} />}
          />

          <StatCard
            gradient
            description={getTopSourcesDescription()}
            gradientColor="warning"
            tag="Top Source"
            tagColor="warning"
            title={summary.topSource.replace('_', ' ')}
            icon={<Filter size={24} />}
          />
        </div>
      )}

      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          {topContent}

          {/* Income Grid */}
          <div className="mt-6">
            {isInitialLoading ? (
              <div className="py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-default-500">Loading income...</p>
                </div>
              </div>
            ) : displayedIncome.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-default-500">
                  {filterValue || sourceFilter !== 'ALL'
                    ? 'No income found'
                    : 'No income records yet.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3">
                  {displayedIncome.map(income => (
                    <IncomeCard
                      key={income.id}
                      income={income}
                      onOtherIncomeClick={setSelectedIncome}
                      onEdit={handleEdit}
                      onDelete={id =>
                        handleDelete(id, income.sourceType, income.sourceId)
                      }
                      isDeleting={isDeleting}
                    />
                  ))}
                </div>

                {/* Load More Indicator */}
                {isPaginating && (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                )}

                {/* End of Results */}
                {displayedIncome.length >= filteredIncome.length &&
                  filteredIncome.length > 0 && (
                    <div className="text-center py-6">
                      <p className="text-xs text-default-400">
                        Showing all {filteredIncome.length} results
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Other Income Modal */}
      <OtherIncomeModal
        income={selectedIncome}
        isOpen={!!selectedIncome}
        onClose={() => setSelectedIncome(null)}
      />

      {/* Add Income Drawer */}
      <AddIncomeDrawer
        isOpen={isIncomeDrawerOpen}
        onClose={handleIncomeDrawerClose}
        incomeId={editIncomeId}
        onSuccess={data => {
          console.log('Income added:', data);
          handleManualRefresh();
        }}
      />

      {/* Edit Quotation Drawer */}
      <CreateQuotationDrawer
        isOpen={isModalOpen && !!editQuotationId}
        quotationId={editQuotationId}
        onClose={handleModalClose}
      />

      {/* Edit Sale Drawer */}
      <CreateSaleDrawer
        saleId={editSaleId}
        isOpen={isModalOpen && !!editSaleId}
        onClose={handleModalClose}
      />
    </>
  );
}
