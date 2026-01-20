'use client';

import React, { ReactNode } from 'react';
import {
  Input,
  Button,
  Chip,
  Card,
  CardBody,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { Search, RefreshCw, Plus, X, Filter, ChevronDown } from 'lucide-react';
import StatCard from '../ui/StatCard';

export interface StatCardData {
  gradient?: boolean;
  description: string;
  gradientColor?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  tag: string;
  tagColor?:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'default';
  title: string;
  icon: ReactNode;
  className?: string;
}

export interface StatusFilter {
  label: string;
  value: string;
  color?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'danger';
}

export interface TypeFilter {
  label: string;
  value: string;
}

export interface GridConfig {
  default?: number; // mobile
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
}

interface UniversalListLayoutProps<
  TStatus extends string = string,
  TType extends string = string,
> {
  // Stats
  stats: StatCardData[];

  // Search
  searchValue: string;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;

  // Filters
  statusFilters?: StatusFilter[];
  selectedStatus?: TStatus;
  onStatusChange?: (value: TStatus) => void;

  typeFilters?: TypeFilter[];
  selectedType?: TType;
  onTypeChange?: (value: TType) => void;

  // Actions
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  onAdd?: () => void;
  addButtonText?: string;
  addButtonIcon?: ReactNode;

  // Items
  items: ReactNode[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyActionText?: string;
  onEmptyAction?: () => void;

  // Grid configuration
  gridConfig?: GridConfig;

  // Pagination/Infinite scroll
  hasMore?: boolean;
  isPaginating?: boolean;
  currentCount?: number;
  totalCount?: number;

  // Additional content
  headerContent?: ReactNode;
  footerContent?: ReactNode;
  leftContent?: ReactNode; // New: content for left side (like count)
  topContent?: ReactNode; // New: content above items (for charts, etc.)
}

export default function UniversalListLayout<
  TStatus extends string = string,
  TType extends string = string,
>({
  stats,
  searchValue,
  searchPlaceholder = 'Search...',
  onSearchChange,
  onSearchClear,
  statusFilters = [],
  selectedStatus,
  onStatusChange,
  typeFilters = [],
  selectedType,
  onTypeChange,
  onRefresh,
  isRefreshing = false,
  onAdd,
  addButtonText,
  addButtonIcon = <Plus className="w-4 h-4" />,
  items,
  isLoading = false,
  emptyMessage = 'No items found',
  emptyActionText,
  onEmptyAction,
  gridConfig = { default: 1, md: 2, lg: 3 },
  hasMore = false,
  isPaginating = false,
  currentCount,
  totalCount,
  headerContent,
  footerContent,
  leftContent,
  topContent,
}: UniversalListLayoutProps<TStatus, TType>) {
  const [showSearchInput, setShowSearchInput] = React.useState(false);

  // Determine filter display strategy
  const hasStatusFilters = statusFilters.length > 0;
  const hasTypeFilters = typeFilters.length > 0;
  const showStatusAsDropdown = hasStatusFilters && hasTypeFilters;
  const showStatusAsChips = hasStatusFilters && !hasTypeFilters;

  // Build grid classes from config
  const getGridClasses = () => {
    const classes = ['grid', 'gap-3', 'sm:gap-4', 'p-0.5'];

    if (gridConfig.default) classes.push(`grid-cols-${gridConfig.default}`);
    if (gridConfig.sm) classes.push(`sm:grid-cols-${gridConfig.sm}`);
    if (gridConfig.md) classes.push(`md:grid-cols-${gridConfig.md}`);
    if (gridConfig.lg) classes.push(`lg:grid-cols-${gridConfig.lg}`);
    if (gridConfig.xl) classes.push(`xl:grid-cols-${gridConfig.xl}`);

    return classes.join(' ');
  };

  const handleSearchToggle = () => {
    if (showSearchInput && searchValue) {
      onSearchClear();
    }
    setShowSearchInput(!showSearchInput);
  };

  return (
    <div className="space-y-6">
      {/* Stats Section - Always 3 cards */}
      <div className="grid lg:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Main Content Card */}
      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          {/* Header Actions */}
          <div className="flex flex-col gap-4 mb-6">
            {headerContent}

            {/* Mobile: Compact Controls */}
            <div className="flex gap-2 items-center md:hidden">
              {/* Left content (optional) */}
              {leftContent && <div className="mr-auto">{leftContent}</div>}

              {/* Right side icons */}
              <div className="flex gap-2 ml-auto">
                {/* Search Icon/Clear Button */}
                <Button
                  isIconOnly
                  size="sm"
                  variant={showSearchInput ? 'flat' : 'bordered'}
                  className="h-9 w-9"
                  onPress={handleSearchToggle}
                >
                  {showSearchInput && searchValue ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>

                {/* Status Filter Dropdown (when both filters exist) */}
                {showStatusAsDropdown && (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="bordered"
                        className="h-9 w-9"
                      >
                        <Filter className="w-4 h-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Status filter"
                      selectedKeys={
                        selectedStatus ? new Set([selectedStatus]) : new Set()
                      }
                      selectionMode="single"
                      onSelectionChange={keys => {
                        const selected = Array.from(keys)[0] as TStatus;
                        onStatusChange?.(selected);
                      }}
                    >
                      {statusFilters.map(filter => (
                        <DropdownItem key={filter.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full bg-${filter.color || 'default'}`}
                            />
                            {filter.label}
                          </div>
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                )}

                {/* Refresh Button */}
                {onRefresh && (
                  <Button
                    isIconOnly
                    className={isRefreshing ? 'animate-spin' : ''}
                    size="sm"
                    variant="bordered"
                    isDisabled={isRefreshing}
                    onPress={onRefresh}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}

                {/* Add Button */}
                {onAdd && (
                  <Button isIconOnly size="sm" color="primary" onPress={onAdd}>
                    {addButtonIcon}
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile: Search Input (shown when toggled) */}
            {showSearchInput && (
              <div className="md:hidden">
                <Input
                  autoFocus
                  isClearable
                  classNames={{
                    base: 'w-full',
                    inputWrapper: 'border-1 h-10 rounded-xl',
                  }}
                  placeholder={searchPlaceholder}
                  size="sm"
                  startContent={<Search className="w-4 h-4 text-default-300" />}
                  value={searchValue}
                  variant="bordered"
                  onClear={onSearchClear}
                  onValueChange={onSearchChange}
                />
              </div>
            )}

            {/* Desktop: Full Layout */}
            <div className="hidden md:flex justify-between gap-3 items-end">
              <div className="flex gap-3 items-center flex-1">
                {leftContent && <div>{leftContent}</div>}
                <Input
                  isClearable
                  classNames={{
                    base: 'w-full sm:max-w-[44%]',
                    inputWrapper: 'border-1 h-10 rounded-xl',
                  }}
                  placeholder={searchPlaceholder}
                  size="sm"
                  startContent={<Search className="w-4 h-4 text-default-300" />}
                  value={searchValue}
                  variant="bordered"
                  onClear={onSearchClear}
                  onValueChange={onSearchChange}
                />
              </div>

              <div className="flex gap-3">
                {/* Status Dropdown (when both filters exist) */}
                {showStatusAsDropdown && (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        endContent={<ChevronDown className="w-4 h-4" />}
                        size="sm"
                        variant="bordered"
                      >
                        {statusFilters.find(f => f.value === selectedStatus)
                          ?.label || 'Status'}
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      disallowEmptySelection
                      aria-label="Status filter"
                      selectedKeys={
                        selectedStatus ? new Set([selectedStatus]) : new Set()
                      }
                      selectionMode="single"
                      onSelectionChange={keys => {
                        const selected = Array.from(keys)[0] as TStatus;
                        onStatusChange?.(selected);
                      }}
                    >
                      {statusFilters.map(filter => (
                        <DropdownItem key={filter.value}>
                          {filter.label}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                )}

                {onRefresh && (
                  <Button
                    isIconOnly
                    className={isRefreshing ? 'animate-spin' : ''}
                    size="sm"
                    variant="bordered"
                    isDisabled={isRefreshing}
                    onPress={onRefresh}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}

                {onAdd && (
                  <Button
                    size="sm"
                    color="primary"
                    startContent={addButtonIcon}
                    onPress={onAdd}
                  >
                    {addButtonText || 'Add'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="flex flex-col gap-3 mb-6">
            {/* Status Filters as Chips (only when no type filters) */}
            {showStatusAsChips && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {statusFilters.map(filter => (
                  <Chip
                    key={filter.value}
                    color={
                      selectedStatus === filter.value ? filter.color : 'default'
                    }
                    variant={selectedStatus === filter.value ? 'solid' : 'flat'}
                    className="cursor-pointer text-xs whitespace-nowrap shrink-0"
                    onClick={() => onStatusChange?.(filter.value as TStatus)}
                  >
                    {filter.label}
                  </Chip>
                ))}
              </div>
            )}

            {/* Type Filters - Always as Scrollable Chips */}
            {hasTypeFilters && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {typeFilters.map(filter => (
                  <Chip
                    key={filter.value}
                    color={
                      selectedType === filter.value ? 'primary' : 'default'
                    }
                    variant={selectedType === filter.value ? 'solid' : 'flat'}
                    className="cursor-pointer text-xs whitespace-nowrap shrink-0"
                    onClick={() => onTypeChange?.(filter.value as TType)}
                  >
                    {filter.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* Items Container - ROBUST SCROLLBAR HIDE */}
          <div className="max-h-150 overflow-y-auto py-2 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0 scrollbar-width-none">
            {/* Top Content (e.g., charts) */}
            {topContent}

            {isLoading ? (
              <div className="py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-default-500">Loading...</p>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-default-500 mb-4">{emptyMessage}</p>
                {emptyActionText && onEmptyAction && (
                  <Button color="primary" size="sm" onPress={onEmptyAction}>
                    {emptyActionText}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className={getGridClasses()}>{items}</div>

                {/* Load More Indicator */}
                {isPaginating && hasMore && (
                  <div className="flex justify-center py-6">
                    <Spinner color="primary" size="sm" />
                  </div>
                )}

                {/* Results Counter */}
                {currentCount !== undefined && totalCount !== undefined && (
                  <div className="text-center py-4">
                    <p className="text-xs text-default-400">
                      {currentCount >= totalCount
                        ? `Showing all ${totalCount} results`
                        : `Showing ${currentCount} of ${totalCount}`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {footerContent}
        </CardBody>
      </Card>
    </div>
  );
}
