# How to Test the System

## Prerequisites
- Node.js 18+ installed
- Next.js dev server running: `npm run dev`
- Database connected (PostgreSQL/MySQL)

---

## Step 1: Create User Account

### Option A: Via Web UI (Recommended)
1. Navigate to: http://localhost:3000/account
2. Click "Sign Up"
3. Enter test credentials:
   - Email: `test@example.com`
   - Password: `Test@1234`
   - Name: `Test User`
4. Click "Create Account"
5. Check email for verification code (or use OTP endpoint)
6. Enter OTP to complete registration

### Option B: Via API (Direct)
```bash
# Using curl (will create user + send OTP)
curl -X POST http://localhost:3000/api/auth/[...nextauth]/route/callback \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234"
  }'
```

---

## Step 2: Run Seed Script (Add Test Data)

The seed script will add:
- ✅ Inventory Items (Products, Raw Materials, Services, Consumables)
- ✅ Test Customers (Buyers, Suppliers)

### Option A: Run Seed via API
```bash
# Navigate to the project
cd /home/z/my-project/rekordly/web

# Run the seed function
npx ts-node src/lib/seed.ts
```

### Option B: Manual Seed via API

#### Create Inventory Item
```bash
curl -X POST http://localhost:3000/api/inventory-items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "itemType": "FINISHED_GOOD",
    "name": "Test Product",
    "sku": "TEST-001",
    "category": "Test",
    "unit": "piece",
    "trackInventory": true,
    "quantityOnHand": 100,
    "reorderLevel": 20,
    "sellingPrice": 1000,
    "description": "Test product for development",
    "showOnStorefront": true,
    "isActive": true
  }'
```

#### Create Customer
```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "ABC Construction",
    "phone": "08012345678",
    "email": "info@abcconstruction.com",
    "role": "BUYER",
    "address": "123 Test Street",
    "city": "Lagos",
    "state": "Lagos",
    "country": "Nigeria"
  }'
```

---

## Step 3: Test the Features

### 1. Inventory Management
```
URL: http://localhost:3000/dashboard/inventory

Features to test:
□ View inventory items list
□ Filter by item type (Products, Raw Materials, Services, Consumables)
□ Search by name, SKU, category
□ Create new inventory item
□ Edit inventory item
□ Delete inventory item (soft delete)
□ Adjust stock levels (stock adjustments)
□ View stock movement history
□ Manage low stock alerts
□ Show/hide items on storefront
```

### 2. Create Purchase (Increase Stock)
```
URL: http://localhost:3000/dashboard/purchases

Steps:
1. Click "New Purchase"
2. Select customer (e.g., "Global Supplies" as SUPPLIER)
3. Enter title: "Purchase #001"
4. Add purchase items:
   - Click "Link to Inventory"
   - Select "Premium Cement 50kg"
   - Enter quantity: 50
   - Enter unit price: ₦7,000
5. Save purchase

Expected Results:
✓ Inventory stock increased by 50 units
✓ Average cost updated (if needed)
✓ Purchase recorded with items
✓ Stock adjustment created
✓ Total calculated correctly

Test: Linking Raw Materials
1. Click "New Purchase"
2. Select supplier
3. Add item: Click "Link to Inventory"
4. Filter: Raw Materials
5. Select "Raw Cement (Bulk)"
6. Enter quantity: 100
7. Enter unit price: ₦5,000
8. Save

Expected Results:
✓ Raw material stock increased
✓ Available for production
```

### 3. Create Production (Raw → Finished Goods)
```
URL: http://localhost:3000/dashboard/productions

Steps:
1. Click "New Production"
2. Enter production details:
   - Title: "Batch #001"
   - Production Date: Today
3. Add raw materials:
   - Select "Raw Cement (Bulk)"
   - Enter quantity: 10
   - Unit cost auto-fills: ₦5,000
   - Total: ₦50,000
   
   - Select "Sand (Sharp)"
   - Enter quantity: 20
   - Unit cost auto-fills: ₦5,000
   - Total: ₦100,000
4. Enter additional costs:
   - Labor Cost: ₦50,000
   - Overhead Cost: ₦20,000
5. Enter output:
   - Item Name: "Concrete Blocks"
   - Quantity Produced: 50 units
   - Unit Selling Price: ₦5,000
6. Check "Add to Inventory" (for batch production)
7. Save

Expected Results:
✓ Production recorded
✓ Raw materials deducted:
   - Raw Cement: -10 (500 → 490)
   - Sand: -20 (300 → 280)
✓ Finished goods added to inventory: +50 units
✓ Average cost calculated:
   - Total cost: 50,000 + 100,000 + 50,000 + 20,000 = 220,000
   - Unit cost: 220,000 ÷ 50 = ₦4,400
✓ Production linked to batch
```

### 4. Create Sale (Decrease Stock)
```
URL: http://localhost:3000/dashboard/sales

Scenario A: Sale with Inventory-Linked Item
1. Click "New Sale"
2. Select customer (e.g., "ABC Construction" as BUYER)
3. Step 1: Add Sale Items
   - Click "Select from Inventory"
   - Filter: Products
   - Select "Premium Cement 50kg"
   - Unit price auto-fills: ₦7,000
   - Enter quantity: 10
   - Check stock availability: 100 >= 10 ✓
4. Step 2: Customer & Sale Details
   - Sale title: "Sale #001"
   - Sale date: Today
5. Step 3: Additional Charges & Payment
   - No delivery cost
   - No VAT
   - No discount
   - Payment: ₦70,000 (full payment)
6. Submit

Expected Results:
✓ Sale created
✓ Inventory stock decreased: 100 → 90
✓ Cost of Goods Sold: 10 × ₦5,000 = ₦50,000 (if average cost tracked)
✓ Sale profit: 10 × (₦7,000 - ₦5,000) = ₦20,000
✓ Customer linked
✓ Payment recorded
```

Scenario B: Sale with Made-to-Order Production
1. Click "New Sale"
2. Add sale item:
   - Item name: "Custom Furniture"
   - Description: "Made to order"
   - Quantity: 5
   - Unit price: ₦25,000
3. Click "Create Production" button
4. Create production:
   - Materials: 20 steel @ ₦1,000 = ₦20,000
   - Labor: ₦5,000
   - Overhead: ₦2,000
   - Total: ₦27,000
   - Output: 5 units
   - Unit cost: ₦5,400
   - Check "Made-to-Order" (don't add to inventory)
   - Link to sale
5. Submit production
6. Continue with sale

Expected Results:
✓ Production created (deducts raw materials)
✓ Production linked to sale item
✓ Sale item has productionId
✓ Purple badge shows "Made to Order"
✓ Inventory updated for raw materials only
```

Scenario C: Sale with Low Stock Warning
1. Click "New Sale"
2. Add sale item:
   - Select from Inventory: "Premium Cement 50kg"
   - Enter quantity: 90 (stock is 100)
3. Should show: Low Stock warning
   - Message: "Low Stock. Current: 100, Reorder at: 50"
4. Still allows adding
5. Submit sale

Expected Results:
✓ Sale created
✓ Stock decreased: 100 → 10
✓ Low stock alert displayed but allowed
✓ Recommendation to restock shown
```

Scenario D: Sale with Insufficient Stock
1. Click "New Sale"
2. Add sale item:
   - Select from Inventory: "Premium Cement 50kg"
   - Enter quantity: 150 (stock is 100)
3. Should show: Insufficient Stock error
   - Message: "Only 100 units available. Requested: 150"
   - Options: "Reduce to 100", "Create Production", "Proceed Anyway"

Option 1: Reduce Quantity
- Click "Reduce to 100"
- Quantity updates
- Can now submit sale

Option 2: Create Production
- Click "Create Production"
- Opens production modal
- Create made-to-order production
- Production links to sale item
- Submit sale

Option 3: Proceed Anyway
- Click "Proceed Anyway"
- Override warning
- Submit sale with insufficient stock
- Allows back-orders

Expected Results:
✓ Insufficient stock warning displayed
✓ Three options provided
✓ User can choose best option
```

### 5. Test Storefront
```
URL: http://localhost:3000/storefront

Features to test:
□ View storefront items only
□ Auto-refresh every 30 seconds
□ Add items to cart (simulated)
□ View stock levels in real-time
□ Filter by category
□ Sort by price, name
```

---

## Step 4: Verify Data Integrity

### Check Stock Calculations
```
Formula: New Avg = ((Old Qty × Old Cost) + (New Qty × New Cost)) ÷ (Old Qty + New Qty)

Example 1:
- Initial: 0 units
- Purchase: 100 units @ ₦5,000
- Expected: (0 + 500,000) ÷ 100 = ₦5,000

Example 2:
- Current: 50 units @ ₦5,000 = ₦250,000
- Purchase: 100 units @ ₦5,500 = ₦550,000
- Expected: (250,000 + 550,000) ÷ 150 = ₦5,333.33

Example 3:
- Current: 50 units @ ₦6,000 = ₦300,000
- Production: 50 units @ ₦4,500 = ₦225,000
- Expected: (300,000 + 225,000) ÷ 100 = ₦5,250 (cost saving!)
```

### Check Production Costs
```
Formula: Total = Materials + Labor + Overhead

Example:
- Materials: 20 cement @ ₦5,000 = ₦100,000
- Labor: ₦50,000
- Overhead: ₦20,000
- Total: ₦170,000

Unit Cost:
- Total: ₦170,000
- Output: 50 units
- Unit Cost: 170,000 ÷ 50 = ₦3,400

Profit:
- Selling Price: ₦5,000
- Unit Cost: ₦3,400
- Profit: ₦1,600 per unit
- Margin: 32% (1,600 ÷ 5,000)
```

### Check COGS (Cost of Goods Sold)
```
Formula: COGS = Unit Cost × Quantity Sold

Example:
- Unit Cost: ₦5,000
- Quantity Sold: 10
- COGS: 5,000 × 10 = ₦50,000

Sale Profit:
- Revenue: 10 × ₦7,000 = ₦70,000
- COGS: ₦50,000
- Profit: ₦20,000
- Margin: 28.57% (20,000 ÷ 70,000)
```

---

## Step 5: Test Edge Cases

### Test 1: Stock Reversal on Deletion
```
1. Create sale: 10 units @ ₦1,000
2. Verify: Stock decreased (-10)
3. Delete sale
4. Verify: Stock restored (+10)
5. Verify: Sale status = CANCELLED (soft delete)
```

### Test 2: Multiple Purchases → Weighted Average
```
1. Purchase 1: 50 units @ ₦5,000
   - Stock: 50, Avg: ₦5,000

2. Purchase 2: 100 units @ ₦5,500
   - Stock: 150, Avg: (250,000 + 550,000) ÷ 150 = ₦5,333.33

3. Purchase 3: 50 units @ ₦4,500
   - Stock: 200, Avg: (800,000 + 225,000) ÷ 200 = ₦5,125

Expected: Weighted average updates correctly
```

### Test 3: Production Stock Deduction & Addition
```
1. Create production: Uses 20 cement, Produces 50 blocks
2. Verify: Cement stock: 300 → 280
3. Verify: Blocks stock: 0 → 50
4. Verify: Production cost tracked
```

### Test 4: Batch Production
```
1. Create batch production (not linked to sale):
   - 24 cupcakes @ ₦1,000 per unit
   - Materials + Labor + Overhead = ₦24,000
2. Verify: Cupcakes added to inventory (+24)
3. Verify: Average cost = ₦1,000 per cupcake
4. Create sales over time:
   - Sale 1: 6 units, verify COGS = 6,000
   - Sale 2: 8 units, verify COGS = 8,000
   - Sale 3: 10 units, verify COGS = 10,000
   - Total: 24 sold, COGS = 24,000 ✓
```

### Test 5: Refund with Inventory Return
```
1. Create sale: 10 units @ ₦1,000
2. Verify: Stock: 100 → 90
3. Process refund for 5 units
4. Verify: Stock adjustment created (FOUND)
5. Verify: Stock: 90 → 95
6. Verify: Sale status = REFUNDED
7. Verify: Refund items tracked
```

---

## Troubleshooting

### Build Errors
```
If build fails:
1. Check dev logs: tail -f /home/z/my-project/dev.log
2. Restart dev server: npm run dev
3. Clear Next.js cache: rm -rf .next && npm run dev
```

### Database Connection
```
If database errors:
1. Check DATABASE_URL in .env file
2. Verify database is running
3. Check database migrations
```

### Authentication Errors
```
If auth fails:
1. Verify NEXTAUTH_SECRET in .env
2. Check email server configuration
3. Verify user is onboarded
```

### Stock Calculation Issues
```
If stock doesn't update:
1. Check inventory item trackInventory flag
2. Verify purchase/production completed
3. Check stock adjustments are created
4. Verify average cost calculations
```

---

## Quick Reference URLs

| Feature | URL | Description |
|---------|------|-------------|
| Dashboard | http://localhost:3000/dashboard | Main dashboard |
| Sales | http://localhost:3000/dashboard/sales | Sales management |
| Purchases | http://localhost:3000/dashboard/purchases | Purchases management |
| Inventory | http://localhost:3000/dashboard/inventory | Inventory management |
| Productions | http://localhost:3000/dashboard/productions | Production management |
| Storefront | http://localhost:3000/storefront | Public storefront |
| Reports | http://localhost:3000/dashboard/reports | Reports & analytics |

---

## Test Accounts

After running seed, you can login with:
- Email: `test@example.com`
- Password: `Test@1234`
- Role: Admin (full access)

Or create your own account via signup.

---

## Need Help?

1. Check documentation in `/docs`
2. Run `npm test` to run test suites
3. Check browser console for errors
4. Check server logs: `tail -f /home/z/my-project/dev.log`
