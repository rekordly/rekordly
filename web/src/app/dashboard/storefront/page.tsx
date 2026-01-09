'use client';

import React, { useState, useEffect } from 'react';
import {
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Badge,
  Card,
  CardBody,
} from '@heroui/react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  Filter,
  ShoppingCart,
} from 'lucide-react';

import { useInventoryStore } from '@/store/inventoryStore';
import { StorefrontInventoryItem } from '@/types/inventory';
import { formatCurrency } from '@/lib/fn';
import { StorefrontCard } from '@/components/ui/StorefrontCard';
import { CreateSaleDrawer } from '@/components/drawer/CreateSaleDrawer';
import { ITEM_TYPE_FILTERS, ItemTypeFilter } from '@/config/constant';

export interface CartItem {
  id: string;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  inventoryItemId: string;
  costPrice?: number;
  profit?: number;
}

export default function StorefrontPage() {
  const [filterValue, setFilterValue] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const { isLoading, storefrontItems, fetchStorefrontItems } =
    useInventoryStore();

  useEffect(() => {
    fetchStorefrontItems();
  }, [fetchStorefrontItems]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchStorefrontItems({
      itemType: itemTypeFilter !== 'ALL' ? itemTypeFilter : undefined,
      search: filterValue || undefined,
    });
    setIsRefreshing(false);
  };

  const filteredItems = React.useMemo(() => {
    let filtered = [...storefrontItems];

    // Item type filter
    if (itemTypeFilter !== 'ALL') {
      filtered = filtered.filter(item => item.itemType === itemTypeFilter);
    }

    // Search filter
    if (filterValue) {
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.sku?.toLowerCase().includes(filterValue.toLowerCase()) ||
          item.category?.toLowerCase().includes(filterValue.toLowerCase())
      );
    }

    return filtered;
  }, [storefrontItems, itemTypeFilter, filterValue]);

  const onSearchChange = React.useCallback((value: string) => {
    setFilterValue(value);
  }, []);

  const handleAddToCart = (item: StorefrontInventoryItem, quantity: number) => {
    const existingItemIndex = cart.findIndex(
      cartItem => cartItem.inventoryItemId === item.id
    );

    if (existingItemIndex > -1) {
      // Update quantity if item already in cart
      const updatedCart = [...cart];
      updatedCart[existingItemIndex].quantity += quantity;
      updatedCart[existingItemIndex].amount =
        updatedCart[existingItemIndex].quantity *
        updatedCart[existingItemIndex].unitPrice;
      setCart(updatedCart);
    } else {
      // Add new item to cart
      const cartItem: CartItem = {
        id: `cart-${Date.now()}-${item.id}`,
        itemName: item.name,
        description: item.description || undefined,
        quantity,
        unitPrice: item.sellingPrice,
        amount: quantity * item.sellingPrice,
        inventoryItemId: item.id,
        costPrice: item.averageCost,
        profit: (item.sellingPrice - item.averageCost) * quantity,
      };
      setCart([...cart, cartItem]);
    }
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(cart.filter(item => item.id !== cartItemId));
  };

  const handleUpdateCartQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(cartItemId);
      return;
    }

    const updatedCart = cart.map(item => {
      if (item.id === cartItemId) {
        return {
          ...item,
          quantity,
          amount: quantity * item.unitPrice,
          profit: item.costPrice
            ? (item.unitPrice - item.costPrice) * quantity
            : undefined,
        };
      }
      return item;
    });
    setCart(updatedCart);
  };

  // Count unique items in cart instead of total quantity
  const totalItems = cart.length;
  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setIsCheckoutOpen(true);
  };

  const handleCheckoutSuccess = () => {
    setCart([]);
    setIsCheckoutOpen(false);
  };

  return (
    <div className="p-6 px-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Storefront</h1>
          <p className="text-sm text-default-500">
            Browse and add items to cart
          </p>
        </div>

        {/* Cart Button */}
        <Badge
          content={totalItems}
          color="danger"
          size="lg"
          isInvisible={totalItems === 0}
        >
          <Button
            color="primary"
            startContent={<ShoppingCart className="w-5 h-5" />}
            onPress={handleCheckout}
            isDisabled={cart.length === 0}
          >
            Checkout {cart.length > 0 && `(${formatCurrency(subtotal)})`}
          </Button>
        </Badge>
      </div>

      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6 px-0">
          {/* Search and Filters */}
          <div className="flex flex-col gap-4 mb-6">
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
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    className="h-9 w-9"
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Filters">
                  <DropdownItem
                    key="filters"
                    isReadOnly
                    className="cursor-default"
                  >
                    <div className="flex flex-col gap-3 py-2">
                      <div>
                        <p className="text-xs md:text-sm font-semibold mb-2">
                          Item Type
                        </p>
                        <div className="flex flex-col gap-1">
                          {ITEM_TYPE_FILTERS.map(filter => (
                            <Button
                              key={filter.value}
                              size="sm"
                              variant={
                                itemTypeFilter === filter.value
                                  ? 'flat'
                                  : 'light'
                              }
                              className="justify-start"
                              onPress={() => {
                                setItemTypeFilter(
                                  filter.value as ItemTypeFilter
                                );
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
                placeholder="Search by name, SKU, or category..."
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
                      {ITEM_TYPE_FILTERS.find(f => f.value === itemTypeFilter)
                        ?.label || 'Type'}
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    disallowEmptySelection
                    aria-label="Item type filter"
                    selectedKeys={new Set([itemTypeFilter])}
                    selectionMode="single"
                    onSelectionChange={keys => {
                      const selected = Array.from(keys)[0] as string;
                      setItemTypeFilter(selected as ItemTypeFilter);
                    }}
                  >
                    {ITEM_TYPE_FILTERS.map(filter => (
                      <DropdownItem key={filter.value}>
                        {filter.label}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Grid Layout */}
          {isLoading || isRefreshing ? (
            <div className="py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-default-500">Loading products...</p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-default-500">
                {filterValue || itemTypeFilter !== 'ALL'
                  ? 'No items found'
                  : 'No items available in storefront'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 px-0.5">
              {filteredItems.map(item => (
                <StorefrontCard
                  key={item.id}
                  item={item}
                  onAddToCart={handleAddToCart}
                  cartQuantity={
                    cart.find(c => c.inventoryItemId === item.id)?.quantity || 0
                  }
                  onUpdateCartQuantity={quantity => {
                    const cartItem = cart.find(
                      c => c.inventoryItemId === item.id
                    );
                    if (cartItem) {
                      handleUpdateCartQuantity(cartItem.id, quantity);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Checkout Drawer */}
      <CreateSaleDrawer
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
        initialItems={cart}
        isStorefront={true}
      />
    </div>
  );
}
