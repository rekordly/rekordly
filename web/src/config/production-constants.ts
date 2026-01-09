// config/production-constants.ts

export const PRODUCTION_STATUS_OPTIONS = [
  { value: 'PLANNED', label: 'Planned', color: 'warning' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'primary' },
  { value: 'COMPLETED', label: 'Completed', color: 'success' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'danger' },
];

export const PRODUCTION_STATUS_COLORS = {
  PLANNED: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export const TEMPLATE_CATEGORIES = [
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'PASTRY', label: 'Pastry' },
  { value: 'BREAD', label: 'Bread' },
  { value: 'CAKE', label: 'Cake' },
  { value: 'DESSERT', label: 'Dessert' },
  { value: 'FOOTWEAR', label: 'Footwear' },
  { value: 'LEATHER_GOODS', label: 'Leather Goods' },
  { value: 'TEXTILE', label: 'Textile' },
  { value: 'CRAFT', label: 'Craft' },
  { value: 'FOOD', label: 'Food' },
  { value: 'BEVERAGE', label: 'Beverage' },
  { value: 'OTHER', label: 'Other' },
];

// For inventory type filtering when selecting materials
export const MATERIAL_INVENTORY_TYPES = ['RAW_MATERIAL', 'CONSUMABLE'];

// For inventory type filtering when selecting output product
export const PRODUCT_INVENTORY_TYPES = ['PRODUCED_ITEM', 'FINISHED_GOOD'];

// Batch multiplier presets
export const BATCH_MULTIPLIER_PRESETS = [
  { value: 0.5, label: '0.5x (Half batch)' },
  { value: 1, label: '1x (Standard)' },
  { value: 2, label: '2x (Double)' },
  { value: 3, label: '3x (Triple)' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
];

// Production form modes
export const PRODUCTION_MODES = {
  TEMPLATE_BASED: 'template_based',
  ONE_TIME: 'one_time',
};

// Cost breakdown labels
export const COST_LABELS = {
  materialsCost: 'Materials Cost',
  laborCost: 'Labor Cost',
  overheadCost: 'Overhead Cost',
  totalCost: 'Total Cost',
  unitCost: 'Unit Cost',
};

// Validation messages
export const VALIDATION_MESSAGES = {
  NO_MATERIALS: 'Please add at least one material',
  INSUFFICIENT_STOCK: 'Insufficient stock for some materials',
  NO_OUTPUT_PRODUCT: 'Please select an output product',
  INVALID_QUANTITY: 'Please enter a valid quantity',
  TEMPLATE_REQUIRED: 'Please select a template or switch to one-time mode',
};

// Default values
export const DEFAULT_PRODUCTION_VALUES = {
  batchMultiplier: 1,
  laborCost: 0,
  overheadCost: 0,
  status: 'COMPLETED',
};

export const DEFAULT_TEMPLATE_VALUES = {
  outputQuantity: 1,
  defaultLaborCost: 0,
  defaultOverheadCost: 0,
  isActive: true,
};
