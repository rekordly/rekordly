// 'use client';

// import React, { useState, useEffect } from 'react';
// import { Wallet, TrendingUp, Filter, Plus } from 'lucide-react';
// import { useRevenueStore } from '@/store/revenue-store';
// import { RevenueCard } from '@/components/ui/RevenueCard';
// import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
// import { formatCurrency } from '@/lib/fn';
// import UniversalListLayout from '@/components/layout/UniversalListLayout';
// import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
// import { RevenueItem } from '@/types/revenue';
// import { addToast } from '@heroui/react';

// type SourceType = 'ALL' | 'SALE' | 'QUOTATION' | 'OTHER_INCOME';

// const SOURCE_FILTERS = [
//   { label: 'All Sources', value: 'ALL' as SourceType },
//   { label: 'Sales', value: 'SALE' as SourceType },
//   { label: 'Quotations', value: 'QUOTATION' as SourceType },
//   { label: 'Other Income', value: 'OTHER_INCOME' as SourceType },
// ];

// export default function RevenuePage() {
//   const [filterValue, setFilterValue] = useState('');
//   const [sourceFilter, setSourceFilter] = useState<SourceType>('ALL');
//   const [isDrawerOpen, setIsDrawerOpen] = useState(false);
//   const [selectedRevenue, setSelectedRevenue] = useState<RevenueItem | null>(
//     null
//   );
//   const [editIncomeId, setEditIncomeId] = useState<string | null>(null);

//   const {
//     displayedRevenue,
//     filteredRevenue,
//     isInitialLoading,
//     isPaginating,
//     isDeleting,
//     summary,
//     fetchRevenue,
//     deleteRevenue,
//     searchRevenue,
//     setSourceFilter: setStoreSourceFilter,
//     clearSearch,
//   } = useRevenueStore();

//   useEffect(() => {
//     fetchRevenue();
//   }, [fetchRevenue]);

//   const handleEdit = (revenue: RevenueItem) => {
//     if (revenue.type === 'OTHER_INCOME') {
//       setEditIncomeId(revenue.id);
//       setIsDrawerOpen(true);
//     }
//   };

//   const handleDelete = async (
//     id: string,
//     sourceType: string,
//     sourceId: string
//   ) => {
//     try {
//       await deleteRevenue(id, sourceType as any, sourceId);
//       addToast({
//         title: 'Success',
//         description: 'Revenue deleted successfully',
//         color: 'success',
//       });
//     } catch (error: any) {
//       addToast({
//         title: 'Error',
//         description:
//           error?.response?.data?.message || 'Failed to delete revenue',
//         color: 'danger',
//       });
//     }
//   };

//   const getTopSourcesDescription = () => {
//     if (!summary?.bySource) return '';

//     const sources = [
//       { name: 'Sales', value: summary.bySource.sales.netRevenue },
//       { name: 'Quotations', value: summary.bySource.quotations.netRevenue },
//       { name: 'Other Income', value: summary.bySource.otherIncome.revenue },
//     ];

//     const topSource = sources.reduce((max, curr) =>
//       curr.value > max.value ? curr : max
//     );
//     return `Leading with ${topSource.name.toLowerCase()} at ${formatCurrency(topSource.value)}`;
//   };

//   if (isInitialLoading) {
//     return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
//   }

//   return (
//     <>
//       <UniversalListLayout<never, SourceType>
//         stats={[
//           {
//             gradient: true,
//             description: `Gross revenue of ${formatCurrency(summary?.totalRevenueAccrual || 0)} less ${formatCurrency(summary?.totalRefunds || 0)} in refunds. Outstanding balance: ${formatCurrency(summary?.totalOutstanding || 0)}`,
//             gradientColor: 'success',
//             tag: 'Net Revenue (Accrual)',
//             tagColor: 'success',
//             title: formatCurrency(summary?.netRevenueAccrual || 0),
//             icon: <Wallet size={24} />,
//           },
//           {
//             gradient: true,
//             description: `Cash actually collected from customers. ${summary?.totalOutstanding ? `${formatCurrency(summary.totalOutstanding)} still pending collection` : 'All revenue collected'}`,
//             gradientColor: 'primary',
//             tag: 'Cash Collected',
//             tagColor: 'primary',
//             title: formatCurrency(summary?.totalCashCollected || 0),
//             icon: <TrendingUp size={24} />,
//           },
//           {
//             gradient: true,
//             description: getTopSourcesDescription(),
//             gradientColor: 'warning',
//             tag: 'Top Source',
//             tagColor: 'warning',
//             title: summary
//               ? summary.bySource.sales.netRevenue >
//                 summary.bySource.quotations.netRevenue
//                 ? 'Sales'
//                 : summary.bySource.quotations.netRevenue >
//                     summary.bySource.otherIncome.revenue
//                   ? 'Quotations'
//                   : 'Other Income'
//               : 'N/A',
//             icon: <Filter size={24} />,
//           },
//         ]}
//         searchValue={filterValue}
//         searchPlaceholder="Search by customer, title, or amount..."
//         onSearchChange={value => {
//           setFilterValue(value);
//           searchRevenue(value);
//         }}
//         onSearchClear={() => {
//           setFilterValue('');
//           clearSearch();
//         }}
//         typeFilters={SOURCE_FILTERS}
//         selectedType={sourceFilter}
//         onTypeChange={value => {
//           setSourceFilter(value);
//           setStoreSourceFilter(value as any);
//         }}
//         onRefresh={() => fetchRevenue(true)}
//         onAdd={() => setIsDrawerOpen(true)}
//         addButtonText="Add Income"
//         addButtonIcon={<Plus className="w-4 h-4" />}
//         items={displayedRevenue.map(revenue => (
//           <RevenueCard
//             key={revenue.id}
//             revenue={revenue}
//             onEdit={handleEdit}
//             onOtherIncomeClick={setSelectedRevenue}
//             isDeleting={isDeleting}
//             onDelete={id => handleDelete(id, revenue.type, revenue.id)}
//           />
//         ))}
//         emptyMessage={
//           filterValue || sourceFilter !== 'ALL'
//             ? 'No revenue found'
//             : 'No revenue records yet.'
//         }
//         gridConfig={{ default: 1, md: 2, lg: 3 }}
//         hasMore={displayedRevenue.length < filteredRevenue.length}
//         isPaginating={isPaginating}
//         currentCount={displayedRevenue.length}
//         totalCount={filteredRevenue.length}
//       />

//       <AddIncomeDrawer
//         isOpen={isDrawerOpen}
//         onClose={() => {
//           setIsDrawerOpen(false);
//           setEditIncomeId(null);
//         }}
//         incomeId={editIncomeId}
//       />
//     </>
//   );
// }
