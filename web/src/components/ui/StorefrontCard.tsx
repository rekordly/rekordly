'use client';

import { AlertTriangle, ShoppingCart, Plus, Minus } from 'lucide-react';
import { Chip, Button, Input } from '@heroui/react';
import { useState } from 'react';
import { StorefrontInventoryItem } from '@/types/inventory';
import { formatCurrency } from '@/lib/fn';

interface StorefrontCardProps {
  item: StorefrontInventoryItem;
  onAddToCart: (item: StorefrontInventoryItem, quantity: number) => void;
  cartQuantity: number;
  onUpdateCartQuantity: (quantity: number) => void;
}

const formatItemType = (type: string): string => {
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

export function StorefrontCard({
  item,
  onAddToCart,
  cartQuantity,
  onUpdateCartQuantity,
}: StorefrontCardProps) {
  const [quantity, setQuantity] = useState(1);

  const fallbackImage =
    'https://via.placeholder.com/300x200/e0e0e0/757575?text=No+Image';
  const displayImage = item.storefrontImage || fallbackImage;

  const isOutOfStock = item.trackInventory && item.quantityOnHand <= 0;

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    onAddToCart(item, 1);
  };

  const handleIncrement = () => {
    if (cartQuantity < item.quantityOnHand || !item.trackInventory) {
      onUpdateCartQuantity(cartQuantity + 1);
    }
  };

  const handleDecrement = () => {
    if (cartQuantity > 0) {
      onUpdateCartQuantity(cartQuantity - 1);
    }
  };

  const handleQuantityChange = (value: string) => {
    const val = parseInt(value) || 0;
    if (val <= 0) {
      onUpdateCartQuantity(0);
      return;
    }
    if (item.trackInventory) {
      onUpdateCartQuantity(Math.min(val, item.quantityOnHand));
    } else {
      onUpdateCartQuantity(val);
    }
  };

  return (
    <div className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-transparent hover:border-primary/20">
      {/* Image Section */}
      <div className="relative w-full h-48  bg-default-100">
        <img
          src={displayImage}
          alt={item.name}
          className="w-full h-full object-cover"
        />

        {/* Stock Status Badge - Top Left */}
        {isOutOfStock ? (
          <div className="absolute top-3 left-3">
            <Chip
              size="sm"
              color="danger"
              variant="solid"
              className="text-xs font-medium"
            >
              Out of Stock
            </Chip>
          </div>
        ) : (
          <div className="absolute top-3 left-3">
            <Chip
              size="sm"
              color="success"
              variant="solid"
              className="text-xs font-medium"
            >
              In Stock
            </Chip>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-3">
        {/* SKU & Item Type */}
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-medium text-default-400 uppercase tracking-wide">
            {item.sku || 'No SKU'}
          </span>
          <Chip size="sm" variant="flat" className="text-[0.65rem] h-5">
            {formatItemType(item.itemType)}
          </Chip>
        </div>

        {/* Item Name */}
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">
          {item.name}
        </h3>

        {/* Price Row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(item.sellingPrice)}
            </p>
            <span className="text-[0.65rem] text-default-500">
              {item.quantityOnHand} {item.unit} available
            </span>
          </div>
        </div>

        {/* Cart Controls */}
        {cartQuantity > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 bg-primary-50 dark:bg-primary-900/20 rounded-lg px-2 py-1">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                onPress={handleDecrement}
              >
                <Minus size={14} />
              </Button>
              <input
                type="number"
                value={cartQuantity}
                onChange={e => handleQuantityChange(e.target.value)}
                className="text-sm font-semibold flex-1 text-center bg-transparent border-none outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ width: '100%' }}
              />
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                onPress={handleIncrement}
                isDisabled={
                  item.trackInventory && cartQuantity >= item.quantityOnHand
                }
              >
                <Plus size={14} />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            color="primary"
            className="w-full"
            startContent={<ShoppingCart size={16} />}
            onPress={handleAddToCart}
            isDisabled={isOutOfStock}
          >
            {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          </Button>
        )}
      </div>
    </div>
  );
}
