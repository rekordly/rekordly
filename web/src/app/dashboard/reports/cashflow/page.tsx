'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useCashFlowStore } from '@/store/cashflow-store';
import { CashFlowItem, CashFlowCategory, CashFlowType } from '@/types/cashflow';
import { CashFlowCard } from '@/components/ui/CashFlowCard';
import { CashFlowModal } from '@/components/modals/CashFlowModal';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

const CATEGORY_FILTERS = [
  { label: 'All Categories', value: 'ALL' },
  { label: 'Operating', value: 'OPERATING' },
  { label: 'Investing', value: 'INVESTING' },
  { label: 'Financing', value: 'FINANCING' },
] as const; // Ensure values are readonly literal types

const FLOW_TYPE_FILTERS = [
  { label: 'All Flows', value: 'ALL' },
  { label: 'Inflows', value: 'INFLOW' },
  { label: 'Outflows', value: 'OUTFLOW' },
] as const; // Ensure values are readonly literal types

const CHART_COLORS = {
  inflow: '#10b981',
  outflow: '#ef4444',
  operating: '#3b82f6',
};

export default function CashFlowPage() {
  const [filterValue, setFilterValue] = useState('');
  // Initialize state with the specific literal type to ensure type safety throughout the component
  const [categoryFilter, setCategoryFilter] = useState<
    CashFlowCategory | 'ALL'
  >('ALL');
  const [flowTypeFilter, setFlowTypeFilter] = useState<CashFlowType | 'ALL'>(
    'ALL'
  );
  const [selectedItem, setSelectedItem] = useState<CashFlowItem | null>(null);

  const {
    displayedCashFlow,
    filteredCashFlow,
    isInitialLoading,
    isPaginating,
    summary,
    chartData,
    fetchCashFlow,
    searchCashFlow,
    setCategoryFilter: setStoreCategoryFilter,
    setFlowTypeFilter: setStoreFlowTypeFilter,
    clearSearch,
  } = useCashFlowStore();

  useEffect(() => {
    fetchCashFlow();
  }, [fetchCashFlow]);

  const handleCategoryFilterChange = (category: string) => {
    setCategoryFilter(category as CashFlowCategory | 'ALL');
    setStoreCategoryFilter(category as CashFlowCategory | 'ALL');
  };

  const handleFlowTypeFilterChange = (flowType: string) => {
    setFlowTypeFilter(flowType as CashFlowType | 'ALL');
    setStoreFlowTypeFilter(flowType as CashFlowType | 'ALL');
  };

  const getNetCashFlowDescription = () => {
    if (!summary) return '';
    const { operating, investing, financing, netCashFlow } = summary;
    const net = netCashFlow ?? 0;
    const opNet = operating?.net ?? 0;
    const invNet = investing?.net ?? 0;
    const finNet = financing?.net ?? 0;

    const isPositive = net >= 0;
    return `Your business generated ${formatCurrency(Math.abs(net))} ${isPositive ? 'positive' : 'negative'} cash flow. Operations contributed ${formatCurrency(opNet)}, investing activities ${invNet >= 0 ? 'added' : 'used'} ${formatCurrency(Math.abs(invNet))}, and financing activities ${finNet >= 0 ? 'provided' : 'consumed'} ${formatCurrency(Math.abs(finNet))}.`;
  };

  const getOperatingCashFlowDescription = () => {
    if (!summary) return '';
    const { operating } = summary;
    const opNet = operating?.net ?? 0;
    const opIn = operating?.inflows ?? 0;
    const opOut = operating?.outflows ?? 0;

    const isPositive = opNet >= 0;
    return `Core business operations ${isPositive ? 'generated' : 'consumed'} ${formatCurrency(Math.abs(opNet))} in cash. You received ${formatCurrency(opIn)} from customers and other sources, while paying out ${formatCurrency(opOut)} for purchases, expenses, and operating costs.`;
  };

  const getMonthlyAverageDescription = () => {
    if (!summary) return '';
    const { averagePerMonth, totalInflows, totalOutflows } = summary;
    const avg = averagePerMonth ?? 0;
    const inFlow = totalInflows ?? 0;
    const outFlow = totalOutflows ?? 0;

    const isPositive = avg >= 0;
    return `Monthly cash flow averages ${formatCurrency(Math.abs(avg))} ${isPositive ? 'surplus' : 'deficit'}. Total cash inflows of ${formatCurrency(inFlow)} versus outflows of ${formatCurrency(outFlow)} ${isPositive ? 'indicate healthy liquidity' : 'suggest cash management attention needed'}.`;
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

  // Charts Component
  const chartsContent = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Category Breakdown Chart */}
      {categoryChartData.length > 0 && (
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">Cash Flow by Category</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
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
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">6-Month Trend</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
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
  );

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<never, 'ALL' | CashFlowCategory>
        stats={[
          {
            gradient: true,
            description: getNetCashFlowDescription(),
            gradientColor:
              (summary?.netCashFlow ?? 0) >= 0 ? 'success' : 'danger',
            tag: 'Net Cash Flow',
            tagColor: (summary?.netCashFlow ?? 0) >= 0 ? 'success' : 'danger',
            title: formatCurrency(summary?.netCashFlow ?? 0),
            icon:
              (summary?.netCashFlow ?? 0) >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              ),
          },
          {
            gradient: true,
            description: getOperatingCashFlowDescription(),
            gradientColor:
              (summary?.operating?.net ?? 0) >= 0 ? 'primary' : 'warning',
            tag: 'Operating Cash Flow',
            tagColor:
              (summary?.operating?.net ?? 0) >= 0 ? 'primary' : 'warning',
            title: formatCurrency(summary?.operating?.net ?? 0),
            icon: <Activity size={24} />,
          },
          {
            gradient: true,
            description: getMonthlyAverageDescription(),
            gradientColor:
              (summary?.averagePerMonth ?? 0) >= 0 ? 'success' : 'danger',
            tag: 'Monthly Average',
            tagColor:
              (summary?.averagePerMonth ?? 0) >= 0 ? 'success' : 'danger',
            title: formatCurrency(Math.abs(summary?.averagePerMonth ?? 0)),
            icon:
              (summary?.averagePerMonth ?? 0) >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              ),
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by description, customer, vendor, or amount..."
        onSearchChange={value => {
          setFilterValue(value);
          searchCashFlow(value);
        }}
        onSearchClear={() => {
          setFilterValue('');
          clearSearch();
        }}
        typeFilters={[
          ...CATEGORY_FILTERS,
          ...FLOW_TYPE_FILTERS.filter(f => f.value !== 'ALL'),
        ]}
        // We ensure the value passed here is strictly "ALL" | CashFlowCategory
        selectedType={categoryFilter !== 'ALL' ? categoryFilter : 'ALL'}
        onTypeChange={value => {
          if (['OPERATING', 'INVESTING', 'FINANCING'].includes(value)) {
            handleCategoryFilterChange(value);
            setFlowTypeFilter('ALL');
          } else {
            // Note: The layout only supports "ALL" | CashFlowCategory.
            // If value is 'INFLOW'/'OUTFLOW', it won't match 'selectedType' expectation,
            // but that is acceptable because we are switching modes locally here.
            handleFlowTypeFilterChange(value);
            setCategoryFilter('ALL');
          }
        }}
        onRefresh={() => fetchCashFlow(true)}
        topContent={chartsContent}
        items={displayedCashFlow.map(item => (
          <CashFlowCard key={item.id} item={item} onClick={setSelectedItem} />
        ))}
        emptyMessage={
          filterValue || categoryFilter !== 'ALL' || flowTypeFilter !== 'ALL'
            ? 'No cash flow records found'
            : 'No cash flow activity yet.'
        }
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayedCashFlow.length < filteredCashFlow.length}
        isPaginating={isPaginating}
        currentCount={displayedCashFlow.length}
        totalCount={filteredCashFlow.length}
      />

      <CashFlowModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}
