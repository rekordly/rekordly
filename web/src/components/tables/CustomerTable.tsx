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
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  ChevronDown,
  MoreVertical,
} from 'lucide-react';

import { useCustomerStore } from '@/store/customerStore';
import { CustomerType } from '@/types/customer';
import { ViewCustomerModal } from '@/components/modals/customers/ViewCustomerModal';
import { AddEditCustomerModal } from '@/components/modals/customers/AddEditCustomerModal';
import { DeleteCustomerModal } from '@/components/modals/customers/DeleteCustomerModal';
import { formatCurrency } from '@/lib/fn';

// Desktop columns
const desktopColumns = [
  { key: 'sn', label: 'S/N', sortable: false },
  { key: 'name', label: 'NAME', sortable: true },
  { key: 'contact', label: 'CONTACT', sortable: false },
  { key: 'type', label: 'TYPE', sortable: true },
  { key: 'amount', label: 'AMOUNT SPENT', sortable: true },
  { key: 'actions', label: 'ACTIONS', sortable: false },
];

// Mobile columns - S/N, Name, Amount, Actions
const mobileColumns = [
  { key: 'sn', label: 'S/N', sortable: false },
  { key: 'name', label: 'NAME', sortable: true },
  { key: 'amount', label: 'AMOUNT', sortable: true },
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

export default function CustomerTable() {
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

  // Modal states
  const [viewCustomer, setViewCustomer] = useState<CustomerType | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerType | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerType | null>(
    null
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { loading, customers, fetchCustomers } = useCustomerStore();

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Detect mobile screen size
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

  // Filter customers
  const filteredItems = React.useMemo(() => {
    let filtered = [...customers];

    // Apply role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(c => c.customerRole === roleFilter);
    }

    // Apply status filter
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

    // Apply search filter
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

  // Sort first, then paginate
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
        case 'amount':
          first =
            a.customerRole === 'BUYER'
              ? a.totalSpent || 0
              : a.totalRevenue || 0;
          second =
            b.customerRole === 'BUYER'
              ? b.totalSpent || 0
              : b.totalRevenue || 0;
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

  // Paginate after sorting
  const pages = Math.ceil(sortedItems.length / rowsPerPage);
  const paginatedItems = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedItems.slice(start, end);
  }, [page, sortedItems, rowsPerPage]);

  // Use mobile or desktop columns
  const visibleColumns = isMobile ? mobileColumns : desktopColumns;

  const handleRowClick = (customer: CustomerType, columnKey: string) => {
    // Don't open modal if clicking on action buttons
    if (columnKey === 'actions') return;
    setViewCustomer(customer);
  };

  const renderCell = useCallback(
    (customer: CustomerType, columnKey: string, index: number) => {
      switch (columnKey) {
        case 'sn':
          return (
            <div className="text-sm text-default-500">
              {(page - 1) * rowsPerPage + index + 1}
            </div>
          );

        case 'name':
          return (
            <div className="flex flex-col">
              <p className="text-sm font-medium">{customer.name}</p>
              <p className="text-xs text-default-400">
                ID: {customer.id.substring(0, 8)}
              </p>
            </div>
          );

        case 'contact':
          return (
            <div className="flex flex-col gap-1">
              {customer.email && (
                <p className="text-xs text-default-600">{customer.email}</p>
              )}
              {customer.phone && (
                <p className="text-xs text-default-600">{customer.phone}</p>
              )}
              {!customer.email && !customer.phone && (
                <span className="text-xs text-default-400">No contact</span>
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
                content: 'text-default-600',
              }}
            >
              {customer.customerRole === 'BUYER' ? 'Customer' : 'Vendor'}
            </Chip>
          );

        case 'amount':
          const amount =
            customer.customerRole === 'BUYER'
              ? customer.totalSpent || 0
              : customer.totalRevenue || 0;
          const balance =
            customer.customerRole === 'BUYER'
              ? customer.totalOwed || 0
              : customer.totalDebt || 0;

          return (
            <div className="flex flex-col">
              <p className="text-sm font-medium">{formatCurrency(amount)}</p>
              {balance > 0 && (
                <p
                  className={`text-xs ${
                    customer.customerRole === 'BUYER'
                      ? 'text-danger'
                      : 'text-warning'
                  }`}
                >
                  Owes: {formatCurrency(balance)}
                </p>
              )}
            </div>
          );

        case 'actions':
          // Mobile: Show dropdown with 3 dots
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

          // Desktop: Show all three buttons
          return (
            <div
              className="flex items-center gap-1 justify-end"
              // onClick={e => e.stopPropagation()}
            >
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
    [page, rowsPerPage, isMobile]
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
        {/* Mobile Layout: Search and Refresh on first row */}
        <div className="flex gap-3 items-center md:hidden">
          <Input
            isClearable
            classNames={{
              base: 'flex-1',
              inputWrapper: 'border-1 h-10 rounded-xl',
            }}
            placeholder="Search..."
            size="sm"
            startContent={<Search className="w-4 h-4 text-default-300" />}
            value={filterValue}
            variant="bordered"
            onClear={() => setFilterValue('')}
            onValueChange={onSearchChange}
          />
          <Button
            isIconOnly
            className={isRefreshing ? 'animate-spin' : ''}
            size="sm"
            variant="flat"
            isDisabled={isRefreshing}
            onPress={handleManualRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Mobile: Dropdowns and Add button on second row */}
        <div className="grid grid-cols-3 gap-2 md:hidden">
          <Dropdown>
            <DropdownTrigger>
              <Button
                endContent={<ChevronDown className="w-3 h-3" />}
                size="sm"
                variant="flat"
                className="w-full text-xs"
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
                endContent={<ChevronDown className="w-3 h-3" />}
                size="sm"
                variant="flat"
                className="w-full text-xs"
              >
                Status
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

          <Button
            className="bg-foreground text-background text-xs"
            endContent={<Plus className="w-3 h-3" />}
            size="sm"
            onPress={() => setIsAddModalOpen(true)}
          >
            Add
          </Button>
        </div>

        {/* Desktop Layout: Everything in one row */}
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
              variant="flat"
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
                  variant="flat"
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
                  variant="flat"
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

            <Button
              className="bg-foreground text-background"
              endContent={<Plus className="w-4 h-4" />}
              size="sm"
              onPress={() => setIsAddModalOpen(true)}
            >
              Add New
            </Button>
          </div>
        </div>

        <div className="flex justify-between items-center">
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
      wrapper: ['rounded-2xl', 'overflow-x-auto'],
      table: ['min-w-full'],
      th: ['bg-transparent', 'text-default-500', 'border-b', 'border-divider'],
      td: ['py-3'],
      tr: ['cursor-pointer', 'hover:bg-default-100', 'transition-colors'],
    }),
    []
  );

  return (
    <>
      <Table
        aria-label="Customers table"
        bottomContent={bottomContent}
        bottomContentPlacement="outside"
        classNames={classNames}
        removeWrapper
        sortDescriptor={sortDescriptor}
        topContent={topContent}
        topContentPlacement="outside"
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
                {filterValue || roleFilter !== 'all' || statusFilter !== 'all'
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
                <p className="text-sm text-default-500">Loading customers...</p>
              </div>
            </div>
          }
        >
          {item => (
            <TableRow key={item.id}>
              {columnKey => (
                <TableCell
                  onClick={() => handleRowClick(item, columnKey as string)}
                >
                  {renderCell(
                    item,
                    columnKey as string,
                    paginatedItems.indexOf(item)
                  )}
                </TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Modals */}
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
