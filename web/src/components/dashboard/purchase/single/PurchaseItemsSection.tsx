'use client';

import { Card, CardBody } from '@heroui/react';

import { formatCurrency } from '@/lib/fn';
import { Purchase } from '@/types/purchases';
import { Package } from 'lucide-react';

interface PurchaseItemsSectionProps {
  purchase: Purchase;
}

export function PurchaseItemsSection({ purchase }: PurchaseItemsSectionProps) {
  const items = Array.isArray(purchase.items) ? purchase.items : [];
  const otherCosts = Array.isArray(purchase.otherCosts)
    ? purchase.otherCosts
    : [];

  return (
    <Card className="w-full rounded-3xl p-4" shadow="none">
      <CardBody className="p-0 space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Purchase Items</h3>
        </div>

        {/* Items Section */}
        {items.length > 0 && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-default-200">
                    <th className="text-left text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 pr-2">
                      Item
                    </th>
                    <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 px-2">
                      Unit Price
                    </th>
                    <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 px-2">
                      Qty
                    </th>
                    <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 pl-2">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, index: number) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-default-100 last:border-0"
                    >
                      <td className="py-3 pr-2">
                        <p className="text-xs md:text-sm font-medium text-default-900">
                          {item.description || 'N/A'}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <p className="text-xs md:text-sm text-default-700">
                          {formatCurrency(item.unitPrice || 0)}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <p className="text-xs md:text-sm text-default-700">
                          {item.quantity || 'N/A'}
                        </p>
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <p className="text-xs md:text-sm font-semibold text-default-900">
                          {formatCurrency(item.total || 0)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Other Costs */}
        {otherCosts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-default-700 mb-3">
              Other Costs
            </h4>
            <div className="space-y-2">
              {otherCosts.map((cost: any, index: number) => (
                <div
                  key={cost.id || index}
                  className="flex justify-between py-2 border-b border-default-100 last:border-0"
                >
                  <span className="text-xs md:text-sm text-default-700">
                    {cost.description}
                  </span>
                  <span className="text-xs md:text-sm font-semibold text-default-900">
                    {formatCurrency(cost.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="pt-4 mt-4 space-y-2.5 border-t border-default-200">
          {/* Subtotal */}
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-default-600">Subtotal</span>
            <span className="font-medium">
              {formatCurrency(purchase.subtotal)}
            </span>
          </div>

          {/* VAT */}
          {purchase.includeVAT && purchase.vatAmount && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">
                <span className="bg-secondary text-white text-xs md:text-sm px-1.5 py-0.5 rounded mr-1">
                  7.5%
                </span>
                VAT
              </span>
              <span className="font-medium">
                {formatCurrency(purchase.vatAmount)}
              </span>
            </div>
          )}

          {/* Other Costs Total */}
          {otherCosts.length > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">Other Costs</span>
              <span className="font-medium">
                {formatCurrency(purchase.otherCostsTotal)}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between text-sm md:text-base font-bold pt-3 mt-3 border-t border-secondary-200">
            <span className="text-primary-400">GRAND TOTAL</span>
            <span className="text-default-900">
              {formatCurrency(purchase.totalAmount)}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
