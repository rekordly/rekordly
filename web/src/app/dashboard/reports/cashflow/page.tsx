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
  CardHeader,
} from '@heroui/react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useCashFlowStore } from '@/store/cashflow-store';
import { CashFlowItem, CashFlowCategory, CashFlowType } from '@/types/cashflow';
import { CashFlowCard } from '@/components/ui/CashFlowCard';
import { CashFlowModal } from '@/components/modals/CashFlowModal';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';

const CATEGORY_FILTERS = [
  { label: 'All Categories', value: 'ALL' },
  { label: 'Operating', value: 'OPERATING' },
  { label: 'Investing', value: 'INVESTING' },
  { label: 'Financing', value: 'FINANCING' },
];

const FLOW_TYPE_FILTERS = [
  { label: 'All Flows', value: 'ALL' },
  { label: 'Inflows', value: 'INFLOW' },
  { label: 'Outflows', value: 'OUTFLOW' },
];

const CHART_COLORS = {
  inflow: '#10b981',
  outflow: '#ef4444',
  operating: '#3b82f6',
  investing: '#8b5cf6',
  financing: '#f59e0b',
};

export default function CashFlowList() {
  const [filterValue, setFilterValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [flowTypeFilter, setFlowTypeFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CashFlowItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const {
    displayedCashFlow,
    filteredCashFlow,
    isInitialLoading,
    isPaginating,
    summary,
    chartData,
    meta,
    fetchCashFlow,
    loadMoreDisplayed,
    searchCashFlow,
    setCategoryFilter: setStoreCategoryFilter,
    setFlowTypeFilter: setStoreFlowTypeFilter,
    clearSearch,
  } = useCashFlowStore();

  useEffect(() => {
    fetchCashFlow();
  }, [fetchCashFlow]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchCashFlow(true);
    setIsRefreshing(false);
  };

  const onSearchChange = useCallback(
    (value: string) => {
      setFilterValue(value);
      searchCashFlow(value);
    },
    [searchCashFlow]
  );

  const handleCategoryFilterChange = (category: string) => {
    setCategoryFilter(category);
    setStoreCategoryFilter(category as CashFlowCategory | 'ALL');
  };

  const handleFlowTypeFilterChange = (flowType: string) => {
    setFlowTypeFilter(flowType);
    setStoreFlowTypeFilter(flowType as CashFlowType | 'ALL');
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const bottom = documentHeight - scrollPosition <= 100;

      if (
        bottom &&
        !isPaginating &&
        displayedCashFlow.length < filteredCashFlow.length
      ) {
        loadMoreDisplayed();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [
    isPaginating,
    displayedCashFlow.length,
    filteredCashFlow.length,
    loadMoreDisplayed,
  ]);

  const getNetCashFlowDescription = () => {
    if (!summary) return '';

    const { operating, investing, financing, netCashFlow } = summary;
    const isPositive = netCashFlow >= 0;

    return `Your business generated ${formatCurrency(Math.abs(netCashFlow))} ${isPositive ? 'positive' : 'negative'} cash flow. Operations contributed ${formatCurrency(operating.net)}, investing activities ${investing.net >= 0 ? 'added' : 'used'} ${formatCurrency(Math.abs(investing.net))}, and financing activities ${financing.net >= 0 ? 'provided' : 'consumed'} ${formatCurrency(Math.abs(financing.net))}.`;
  };

  const getOperatingCashFlowDescription = () => {
    if (!summary) return '';

    const { operating } = summary;
    const isPositive = operating.net >= 0;

    return `Core business operations ${isPositive ? 'generated' : 'consumed'} ${formatCurrency(Math.abs(operating.net))} in cash. You received ${formatCurrency(operating.inflows)} from customers and other sources, while paying out ${formatCurrency(operating.outflows)} for purchases, expenses, and operating costs.`;
  };

  const getMonthlyAverageDescription = () => {
    if (!summary) return '';

    const { averagePerMonth, totalInflows, totalOutflows } = summary;
    const isPositive = averagePerMonth >= 0;

    return `Monthly cash flow averages ${formatCurrency(Math.abs(averagePerMonth))} ${isPositive ? 'surplus' : 'deficit'}. Total cash inflows of ${formatCurrency(totalInflows)} versus outflows of ${formatCurrency(totalOutflows)} ${isPositive ? 'indicate healthy liquidity' : 'suggest cash management attention needed'}.`;
  };

  // Prepare chart data
  const categoryChartData =
    chartData?.byCategory.map(cat => ({
      name: cat.name.replace(' Activities', ''),
      inflow: cat.inflow,
      outflow: cat.outflow,
      net: cat.net,
    })) || [];

  const monthlyChartData =
    chartData?.monthly.slice(-6).map(item => ({
      month: item.month,
      amount: item.amount,
    })) || [];

  const topContent = (
    <div className="flex flex-col gap-4">
      {/* Mobile: Compact layout */}
      <div className="flex gap-2 items-center lg:hidden">
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
                  <p className="text-xs font-semibold mb-2">Category</p>
                  <div className="flex flex-col gap-1">
                    {CATEGORY_FILTERS.map(filter => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={
                          categoryFilter === filter.value ? 'flat' : 'light'
                        }
                        className="justify-start"
                        onPress={() => handleCategoryFilterChange(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2">Flow Type</p>
                  <div className="flex flex-col gap-1">
                    {FLOW_TYPE_FILTERS.map(filter => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={
                          flowTypeFilter === filter.value ? 'flat' : 'light'
                        }
                        className="justify-start"
                        onPress={() => handleFlowTypeFilterChange(filter.value)}
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
      </div>

      {/* Desktop: Full layout */}
      <div className="hidden lg:flex justify-between gap-3 items-end">
        <Input
          isClearable
          classNames={{
            base: 'w-full sm:max-w-[44%]',
            inputWrapper: 'border-1 h-10 rounded-xl',
          }}
          placeholder="Search by description, customer, vendor, or amount..."
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
                {CATEGORY_FILTERS.find(f => f.value === categoryFilter)
                  ?.label || 'Category'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Category filter"
              selectedKeys={new Set([categoryFilter])}
              selectionMode="single"
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                handleCategoryFilterChange(selected);
              }}
            >
              {CATEGORY_FILTERS.map(filter => (
                <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          <Dropdown>
            <DropdownTrigger>
              <Button
                endContent={<ChevronDown className="w-4 h-4" />}
                size="sm"
                variant="bordered"
              >
                {FLOW_TYPE_FILTERS.find(f => f.value === flowTypeFilter)
                  ?.label || 'Flow Type'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Flow type filter"
              selectedKeys={new Set([flowTypeFilter])}
              selectionMode="single"
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                handleFlowTypeFilterChange(selected);
              }}
            >
              {FLOW_TYPE_FILTERS.map(filter => (
                <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
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
            description={getNetCashFlowDescription()}
            gradientColor={summary.netCashFlow >= 0 ? 'success' : 'danger'}
            tag="Net Cash Flow"
            tagColor={summary.netCashFlow >= 0 ? 'success' : 'danger'}
            title={formatCurrency(summary.netCashFlow)}
            icon={
              summary.netCashFlow >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              )
            }
          />

          <StatCard
            gradient
            description={getOperatingCashFlowDescription()}
            gradientColor={summary.operating.net >= 0 ? 'primary' : 'warning'}
            tag="Operating Cash Flow"
            tagColor={summary.operating.net >= 0 ? 'primary' : 'warning'}
            title={formatCurrency(summary.operating.net)}
            icon={<Activity size={24} />}
          />

          <StatCard
            gradient
            description={getMonthlyAverageDescription()}
            gradientColor={summary.averagePerMonth >= 0 ? 'success' : 'danger'}
            tag="Monthly Average"
            tagColor={summary.averagePerMonth >= 0 ? 'success' : 'danger'}
            title={formatCurrency(Math.abs(summary.averagePerMonth))}
            icon={
              summary.averagePerMonth >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              )
            }
          />
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Charts - Right side on desktop, top on mobile */}
        <div className="lg:col-span-5 order-1 lg:order-2">
          <div className="flex flex-col gap-6">
            {/* Category Breakdown Chart */}
            {categoryChartData.length > 0 && (
              <Card className="rounded-3xl" shadow="sm">
                <CardHeader className="pb-0 pt-4 px-4">
                  <h3 className="text-lg font-semibold">
                    Cash Flow by Category
                  </h3>
                </CardHeader>
                <CardBody className="py-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: any) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="inflow"
                        fill={CHART_COLORS.inflow}
                        name="Inflows"
                      />
                      <Bar
                        dataKey="outflow"
                        fill={CHART_COLORS.outflow}
                        name="Outflows"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            )}

            {/* Monthly Trend Chart */}
            {monthlyChartData.length > 0 && (
              <Card className="rounded-3xl" shadow="sm">
                <CardHeader className="pb-0 pt-4 px-4">
                  <h3 className="text-lg font-semibold">6-Month Trend</h3>
                </CardHeader>
                <CardBody className="py-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: any) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar
                        dataKey="amount"
                        fill={CHART_COLORS.operating}
                        name="Net Cash Flow"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        {/* Cash Flow List - Left side on desktop, bottom on mobile */}
        <div className="lg:col-span-7 order-2 lg:order-1">
          <Card className="rounded-3xl bg-transparent" shadow="none">
            <CardBody className="py-6">
              {topContent}

              {/* Cash Flow Grid */}
              <div className="mt-6">
                {isInitialLoading ? (
                  <div className="py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-sm text-default-500">
                        Loading cash flow...
                      </p>
                    </div>
                  </div>
                ) : displayedCashFlow.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-default-500">
                      {filterValue ||
                      categoryFilter !== 'ALL' ||
                      flowTypeFilter !== 'ALL'
                        ? 'No cash flow records found'
                        : 'No cash flow activity yet.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-3">
                      {displayedCashFlow.map(item => (
                        <CashFlowCard
                          key={item.id}
                          item={item}
                          onClick={setSelectedItem}
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
                    {displayedCashFlow.length >= filteredCashFlow.length &&
                      filteredCashFlow.length > 0 && (
                        <div className="text-center py-6">
                          <p className="text-xs text-default-400">
                            Showing all {filteredCashFlow.length} results
                          </p>
                        </div>
                      )}
                  </>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Cash Flow Detail Modal */}
      <CashFlowModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}
