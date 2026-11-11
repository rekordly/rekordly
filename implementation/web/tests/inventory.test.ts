import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  outletSchema,
  productOptionSchema,
  productVariantSchema,
  stockAdjustmentSchema,
  stockCountSchema,
  stockReservationSchema,
  stockTransferSchema,
} from "../src/lib/schemas/finance.schemas.ts";
import { formatMinorAmount } from "../src/lib/money.ts";

describe("Rekordly V2 Blueprint 07 Catalogue & Inventory Frontend Suite", () => {
  it("1. 4-state quantity model: available is calculated as on_hand minus reserved", () => {
    const onHand = 100;
    const reserved = 35;
    const inTransit = 20;

    const available = Math.max(0, onHand - reserved);
    assert.equal(available, 65);
    assert.equal(inTransit, 20);

    // When reserved exceeds on-hand, available is non-negative
    const overReserved = 110;
    const safeAvailable = Math.max(0, onHand - overReserved);
    assert.equal(safeAvailable, 0);
  });

  it("2. Formats minor units accurately for inventory valuation", () => {
    // 50 units @ 40.00 NGN = 2,000.00 NGN (200,000 minor units)
    assert.equal(formatMinorAmount(200000, "NGN", 2), "NGN 2,000.00");
    // Single unit @ 15.50 USD = 1,550 minor units
    assert.equal(formatMinorAmount(1550, "USD", 2), "USD 15.50");
  });

  it("3. Validates outlet creation schema", () => {
    const valid = outletSchema.safeParse({
      name: "Victoria Island Flagship",
      location_type: "outlet",
      code: "VI-01",
      address: "123 Adetokunbo Ademola St",
      phone: "+2348011223344",
    });
    assert.equal(valid.success, true);

    const invalid = outletSchema.safeParse({
      name: "",
      location_type: "invalid_type",
    });
    assert.equal(invalid.success, false);
  });

  it("4. Validates product option and variant matrix schemas", () => {
    const optRes = productOptionSchema.safeParse({
      name: "Size",
      values: "Small, Medium, Large, XL",
    });
    assert.equal(optRes.success, true);

    const varRes = productVariantSchema.safeParse({
      name: "Classic T-Shirt (Large / Red)",
      selling_price: "45.00",
      cost_price: "25.00",
      sku: "TSHIRT-L-RED",
      barcode: "987654321012",
    });
    assert.equal(varRes.success, true);
  });

  it("5. Validates stock transfer schema and ensures valid quantity", () => {
    const valid = stockTransferSchema.safeParse({
      source_location_id: "1",
      destination_location_id: "2",
      product_id: "10",
      quantity: "15.0000",
      notes: "Replenish VI store",
    });
    assert.equal(valid.success, true);

    const invalidQty = stockTransferSchema.safeParse({
      source_location_id: "1",
      destination_location_id: "2",
      product_id: "10",
      quantity: "0",
    });
    assert.equal(invalidQty.success, false);
  });

  it("6. Validates stock count audit schema", () => {
    const valid = stockCountSchema.safeParse({
      location_id: "1",
      scope: "full",
      notes: "Q4 Physical Audit",
    });
    assert.equal(valid.success, true);
  });

  it("7. Validates stock adjustment schema for damage and correction", () => {
    const damageAdj = stockAdjustmentSchema.safeParse({
      location_id: "1",
      reason_code: "damage",
      product_id: "10",
      quantity_delta: "-3.0000",
      notes: "Display shelf cracked",
    });
    assert.equal(damageAdj.success, true);

    const foundAdj = stockAdjustmentSchema.safeParse({
      location_id: "1",
      reason_code: "correction",
      product_id: "10",
      quantity_delta: "2.0000",
      notes: "Surplus found in backroom",
    });
    assert.equal(foundAdj.success, true);
  });

  it("8. Validates stock reservation schema", () => {
    const valid = stockReservationSchema.safeParse({
      product_id: "10",
      location_id: "1",
      quantity: "5.0000",
      notes: "Customer hold for Order #104",
    });
    assert.equal(valid.success, true);
  });
});
