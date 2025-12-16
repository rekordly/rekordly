'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Chip,
  Pagination,
} from '@heroui/react';
import {
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  ChevronDown,
  MoreVertical,
  Filter,
  Users,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';

import { useCustomerStore } from '@/store/customerStore';
import { CustomerType } from '@/types/customer';
import { ViewCustomerModal } from '@/components/modals/customers/ViewCustomerModal';
import { AddEditCustomerModal } from '@/components/modals/customers/AddEditCustomerModal';
import { DeleteCustomerModal } from '@/components/modals/customers/DeleteCustomerModal';
import { formatCurrency } from '@/lib/fn';
import StatCard from '@/components/ui/StatCard';
import { Card, CardBody } from '@heroui/card';

const desktopColumns = [
  { key: 'sn', label: 'S/N', sortable: false },
  { key: 'name', label: 'NAME', sortable: true },
  { key: 'contact', label: 'CONTACT', sortable: false },
  { key: 'type', label: 'TYPE', sortable: true },
  { key: 'revenue', label: 'REVENUE', sortable: true },
  { key: 'balance', label: 'BALANCE', sortable: true },
  { key: 'actions', label: 'ACTIONS', sortable: false },
];

const mobileColumns = [
  { key: 'sn', label: 'S/N', sortable: false },
  { key: 'name', label: 'NAME', sortable: true },
  { key: 'revenue', label: 'REVENUE', sortable: true },
  { key: 'balance', label: 'BALANCE', sortable: true },
  { key: 'actions', label: 'ACTIONS', sortable: false },
];

const ROLE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Customers', value: 'BUYER' },
  { label: 'Vendors', value: 'SUPPLIER' },
];

const STATUS_FILTERS = [
  { label: 'All Status', value: 'all' },
  { label: 'Debtors', value: 'debtor' },
  { label: 'Creditors', value: 'creditor' },
  { label: 'Clear', value: 'clear' },
];

interface CustomerTableProps {
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
}

export default function CustomerTable({
  isAddModalOpen,
  setIsAddModalOpen,
}: CustomerTableProps) {
  const [filterValue, setFilterValue] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortDescriptor, setSortDescriptor] = useState({
    column: 'createdAt',
    direction: 'descending' as 'ascending' | 'descending',
  });
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [viewCustomer, setViewCustomer] = useState<CustomerType | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerType | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerType | null>(
    null
  );

  const { loading, customers, fetchCustomers } = useCustomerStore();

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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
    await fetchCustomers(true);
    setIsRefreshing(false);
  };

  const filteredItems = React.useMemo(() => {
    let filtered = [...customers];

    if (roleFilter !== 'all') {
      filtered = filtered.filter(c => c.customerRole === roleFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        const isDebtor = c.customerRole === 'BUYER' && (c.totalOwed || 0) > 0;
        const isCreditor =
          c.customerRole === 'SUPPLIER' && (c.totalDebt || 0) > 0;
        const isClear = !isDebtor && !isCreditor;

        if (statusFilter === 'debtor') return isDebtor;
        if (statusFilter === 'creditor') return isCreditor;
        if (statusFilter === 'clear') return isClear;
        return true;
      });
    }

    if (filterValue) {
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          c.email?.toLowerCase().includes(filterValue.toLowerCase()) ||
          c.phone?.toLowerCase().includes(filterValue.toLowerCase())
      );
    }

    return filtered;
  }, [customers, roleFilter, statusFilter, filterValue]);

  // Calculate statistics
  const statistics = React.useMemo(() => {
    const totalCustomers = customers.filter(
      c => c.customerRole === 'BUYER'
    ).length;
    const totalVendors = customers.filter(
      c => c.customerRole === 'SUPPLIER'
    ).length;

    // Total money owed by customers (money they owe to us)
    const totalMoneyOwed = customers
      .filter(c => c.customerRole === 'BUYER')
      .reduce((sum, c) => sum + (c.totalOwed || 0), 0);

    // Total money owned to vendors (money we owe to them)
    const totalMoneyOwned = customers
      .filter(c => c.customerRole === 'SUPPLIER')
      .reduce((sum, c) => sum + (c.totalDebt || 0), 0);

    // Total revenue from customers
    const totalRevenue = customers
      .filter(c => c.customerRole === 'BUYER')
      .reduce((sum, c) => sum + (c.totalSpent || 0), 0);

    // Total purchases from vendors
    const totalPurchases = customers
      .filter(c => c.customerRole === 'SUPPLIER')
      .reduce((sum, c) => sum + (c.totalRevenue || 0), 0);

    return {
      totalCustomers,
      totalVendors,
      totalMoneyOwed,
      totalMoneyOwned,
      totalRevenue,
      totalPurchases,
    };
  }, [customers]);

  const sortedItems = React.useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let first: any;
      let second: any;

      switch (sortDescriptor.column) {
        case 'name':
          first = a.name;
          second = b.name;
          break;
        case 'type':
          first = a.customerRole;
          second = b.customerRole;
          break;
        case 'revenue':
          first =
            a.customerRole === 'BUYER'
              ? a.totalSpent || 0
              : a.totalRevenue || 0;
          second =
            b.customerRole === 'BUYER'
              ? b.totalSpent || 0
              : b.totalRevenue || 0;
          break;
        case 'balance':
          first =
            a.customerRole === 'BUYER' ? a.totalOwed || 0 : a.totalDebt || 0;
          second =
            b.customerRole === 'BUYER' ? b.totalOwed || 0 : b.totalDebt || 0;
          break;
        case 'createdAt':
        default:
          first = new Date(a.createdAt).getTime();
          second = new Date(b.createdAt).getTime();
          break;
      }

      const cmp = first < second ? -1 : first > second ? 1 : 0;
      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [filteredItems, sortDescriptor]);

  const pages = Math.ceil(sortedItems.length / rowsPerPage);
  const paginatedItems = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedItems.slice(start, end);
  }, [page, sortedItems, rowsPerPage]);

  const visibleColumns = isMobile ? mobileColumns : desktopColumns;

  const handleRowClick = (customer: CustomerType, columnKey: string) => {
    if (columnKey === 'actions') return;
    setViewCustomer(customer);
  };

  // Check if a customer has outstanding balance
  const hasOutstandingBalance = useCallback((customer: CustomerType) => {
    const balance =
      customer.customerRole === 'BUYER'
        ? customer.totalOwed || 0
        : customer.totalDebt || 0;
    return balance > 0;
  }, []);

  const renderCell = useCallback(
    (customer: CustomerType, columnKey: string, index: number) => {
      const hasBalance = hasOutstandingBalance(customer);
      const balanceAmount =
        customer.customerRole === 'BUYER'
          ? customer.totalOwed || 0
          : customer.totalDebt || 0;

      switch (columnKey) {
        case 'sn':
          return (
            <div
              className={`text-xs md:text-sm ${hasBalance ? 'text-danger' : ''}`}
            >
              {(page - 1) * rowsPerPage + index + 1}.
            </div>
          );

        case 'name':
          return (
            <div className="flex flex-col">
              <p
                className={`text-xs md:text-sm ${hasBalance ? 'text-danger font-medium' : ''}`}
              >
                {customer.name}
              </p>
            </div>
          );

        case 'contact':
          return (
            <div className="flex flex-col gap-1">
              {customer.email && (
                <p className="text-xs md:text-sm text-default-600">
                  {customer.email}
                </p>
              )}
              {customer.phone && (
                <p className="text-xs md:text-sm text-default-600">
                  {customer.phone}
                </p>
              )}
              {!customer.email && !customer.phone && (
                <span className="text-xs md:text-sm text-default-400">
                  No contact
                </span>
              )}
            </div>
          );

        case 'type':
          return (
            <Chip
              size="sm"
              color={
                customer.customerRole === 'BUYER' ? 'primary' : 'secondary'
              }
              variant="dot"
              classNames={{
                base: 'border-none',
                content: 'text-default-600 text-xs md:text-sm',
              }}
            >
              {customer.customerRole === 'BUYER' ? 'Customer' : 'Vendor'}
            </Chip>
          );

        case 'revenue':
          const revenueAmount =
            customer.customerRole === 'BUYER'
              ? customer.totalSpent || 0
              : customer.totalRevenue || 0;

          return (
            <div className="flex flex-col">
              <p className="text-xs md:text-sm">
                {formatCurrency(revenueAmount)}
              </p>
            </div>
          );

        case 'balance':
          return (
            <div className="flex flex-col">
              <p
                className={`text-xs md:text-sm ${hasBalance ? 'text-danger' : ''}`}
              >
                {formatCurrency(balanceAmount)}
              </p>
            </div>
          );

        case 'actions':
          if (isMobile) {
            return (
              <div className="flex items-center justify-center">
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onClick={e => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4 text-default-400" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Customer actions">
                    <DropdownItem
                      key="view"
                      startContent={<Eye className="w-4 h-4" />}
                      onPress={() => setViewCustomer(customer)}
                    >
                      View
                    </DropdownItem>
                    <DropdownItem
                      key="edit"
                      startContent={<Pencil className="w-4 h-4" />}
                      onPress={() => setEditCustomer(customer)}
                    >
                      Edit
                    </DropdownItem>
                    <DropdownItem
                      key="delete"
                      className="text-danger"
                      color="danger"
                      startContent={<Trash2 className="w-4 h-4" />}
                      onPress={() => setDeleteCustomer(customer)}
                    >
                      Delete
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-1 justify-end">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onClick={e => {
                  e.stopPropagation();
                  setViewCustomer(customer);
                }}
              >
                <Eye className="w-4 h-4 text-default-500" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onClick={e => {
                  e.stopPropagation();
                  setEditCustomer(customer);
                }}
              >
                <Pencil className="w-4 h-4 text-default-500" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onClick={e => {
                  e.stopPropagation();
                  setDeleteCustomer(customer);
                }}
              >
                <Trash2 className="w-4 h-4 text-danger" />
              </Button>
            </div>
          );

        default:
          return null;
      }
    },
    [page, rowsPerPage, isMobile, hasOutstandingBalance]
  );

  const onSearchChange = useCallback((value: string) => {
    setFilterValue(value);
    setPage(1);
  }, []);

  const onRowsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setRowsPerPage(Number(e.target.value));
      setPage(1);
    },
    []
  );

  const topContent = React.useMemo(() => {
    return (
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
            onClear={() => setFilterValue('')}
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
                      Type
                    </p>
                    <div className="flex flex-col gap-1">
                      {ROLE_FILTERS.map(filter => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={
                            roleFilter === filter.value ? 'flat' : 'light'
                          }
                          className="justify-start"
                          onPress={() => {
                            setRoleFilter(filter.value);
                            setPage(1);
                          }}
                        >
                          {filter.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm font-semibold mb-2">
                      Status
                    </p>
                    <div className="flex flex-col gap-1">
                      {STATUS_FILTERS.map(filter => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={
                            statusFilter === filter.value ? 'flat' : 'light'
                          }
                          className="justify-start"
                          onPress={() => {
                            setStatusFilter(filter.value);
                            setPage(1);
                          }}
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
        <div className="hidden md:flex justify-between gap-3 items-end">
          <Input
            isClearable
            classNames={{
              base: 'w-full sm:max-w-[44%]',
              inputWrapper: 'border-1 h-10 rounded-xl',
            }}
            placeholder="Search by name, email, or phone..."
            size="sm"
            startContent={<Search className="w-4 h-4 text-default-300" />}
            value={filterValue}
            variant="bordered"
            onClear={() => setFilterValue('')}
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
                  {ROLE_FILTERS.find(f => f.value === roleFilter)?.label ||
                    'Type'}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                disallowEmptySelection
                aria-label="Role filter"
                selectedKeys={new Set([roleFilter])}
                selectionMode="single"
                onSelectionChange={keys => {
                  const selected = Array.from(keys)[0] as string;
                  setRoleFilter(selected);
                  setPage(1);
                }}
              >
                {ROLE_FILTERS.map(filter => (
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
                  {STATUS_FILTERS.find(f => f.value === statusFilter)?.label ||
                    'Status'}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                disallowEmptySelection
                aria-label="Status filter"
                selectedKeys={new Set([statusFilter])}
                selectionMode="single"
                onSelectionChange={keys => {
                  const selected = Array.from(keys)[0] as string;
                  setStatusFilter(selected);
                  setPage(1);
                }}
              >
                {STATUS_FILTERS.map(filter => (
                  <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        <div className="hidden justify-between items-center">
          <span className="text-default-400 text-sm">
            Total {sortedItems.length}{' '}
            {roleFilter === 'all'
              ? 'customers'
              : roleFilter === 'BUYER'
                ? 'customers'
                : 'vendors'}
          </span>
          <label className="flex items-center text-default-400 text-sm gap-2">
            Rows per page:
            <select
              className="bg-transparent outline-none border-1 border-default-300 rounded-lg px-2 py-1 text-sm"
              value={rowsPerPage}
              onChange={onRowsPerPageChange}
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="20">20</option>
            </select>
          </label>
        </div>
      </div>
    );
  }, [
    filterValue,
    roleFilter,
    statusFilter,
    rowsPerPage,
    onSearchChange,
    sortedItems.length,
    isRefreshing,
  ]);

  const bottomContent = React.useMemo(() => {
    return (
      <div className="py-2 px-2 flex justify-center items-center">
        <Pagination
          showControls
          classNames={{
            cursor: 'bg-foreground text-background',
          }}
          color="default"
          page={page}
          total={pages || 1}
          variant="light"
          onChange={setPage}
        />
      </div>
    );
  }, [page, pages]);

  const classNames = React.useMemo(
    () => ({
      wrapper: ['rounded-2xl', 'overflow-x-auto', 'max-h-[600px]'],
      table: ['min-w-full'],
      th: ['bg-transparent', 'text-default-500', 'border-b', 'border-divider'],
      td: ['py-3'],
      tr: ['cursor-pointer', 'hover:bg-default-100', 'transition-colors'],
    }),
    []
  );

  return (
    <>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Total Entities Card */}
        <StatCard
          gradient
          description={`${statistics.totalCustomers} customers and ${statistics.totalVendors} vendors in your network`}
          gradientColor="primary"
          tag="Total Entities"
          tagColor="primary"
          title={`${statistics.totalCustomers + statistics.totalVendors}`}
          icon={<Users size={'24'} />}
        />

        {/* Total Money Owed (by customers) - Credit */}
        <StatCard
          gradient
          description="Total outstanding credit from customers - money owed to your business for goods or services provided"
          gradientColor="success"
          tag="Receivables"
          tagColor="success"
          title={formatCurrency(statistics.totalMoneyOwed)}
          icon={<ArrowDownCircle size={'24'} />}
        />

        {/* Total Money Owned (to vendors) - Debit */}
        <StatCard
          gradient
          description="Total outstanding debt to vendors - money your business owes for goods or services received"
          gradientColor="warning"
          tag="Payables"
          tagColor="warning"
          title={formatCurrency(statistics.totalMoneyOwned)}
          icon={<ArrowUpCircle size={'24'} />}
        />
      </div>

      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          <Table
            aria-label="Customers table"
            bottomContent={bottomContent}
            bottomContentPlacement="outside"
            classNames={classNames}
            removeWrapper
            sortDescriptor={sortDescriptor}
            topContent={topContent}
            topContentPlacement="outside"
            maxTableHeight={600}
            onSortChange={(descriptor: any) => setSortDescriptor(descriptor)}
          >
            <TableHeader columns={visibleColumns}>
              {column => (
                <TableColumn
                  key={column.key}
                  align={column.key === 'actions' ? 'center' : 'start'}
                  allowsSorting={column.sortable}
                >
                  {column.label}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody
              emptyContent={
                <div className="text-center py-8">
                  <p className="text-sm text-default-500">
                    {filterValue ||
                    roleFilter !== 'all' ||
                    statusFilter !== 'all'
                      ? 'No customers found'
                      : 'No customers yet. Add your first customer to get started.'}
                  </p>
                </div>
              }
              items={paginatedItems}
              isLoading={loading || isRefreshing}
              loadingContent={
                <div className="py-20">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-default-500">
                      Loading customers...
                    </p>
                  </div>
                </div>
              }
            >
              {item => {
                const hasBalance = hasOutstandingBalance(item);

                return (
                  <TableRow
                    key={item.id}
                    className={
                      hasBalance
                        ? 'bg-red-50/50 dark:bg-transparent hover:bg-red-100/50'
                        : ''
                    }
                  >
                    {columnKey => (
                      <TableCell
                        onClick={() =>
                          handleRowClick(item, columnKey as string)
                        }
                      >
                        {renderCell(
                          item,
                          columnKey as string,
                          paginatedItems.indexOf(item)
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <ViewCustomerModal
        customer={viewCustomer}
        isOpen={!!viewCustomer}
        onClose={() => setViewCustomer(null)}
      />

      <AddEditCustomerModal
        customer={editCustomer}
        isOpen={isAddModalOpen || !!editCustomer}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditCustomer(null);
        }}
      />

      <DeleteCustomerModal
        customer={deleteCustomer}
        isOpen={!!deleteCustomer}
        onClose={() => setDeleteCustomer(null)}
      />
    </>
  );
}
