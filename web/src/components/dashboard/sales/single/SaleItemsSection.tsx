'use client';

import { Card, CardBody } from '@heroui/react';

import { formatCurrency } from '@/lib/fn';
import { Sale, SaleItemType } from '@/types/sales';

interface SaleItemsSectionProps {
  sale: Sale;
}

export function SaleItemsSection({ sale }: SaleItemsSectionProps) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const otherExpenses = Array.isArray(sale.otherSaleExpenses)
    ? sale.otherSaleExpenses
    : [];

  return (
    <Card className="w-full bg-brand-background rounded-3xl" shadow="none">
      <CardBody className="p-5 space-y-4">
        {/* Items Section */}
        {items.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-default-700 mb-3">
              Items
            </h4>
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
                  {items.map((item: SaleItemType, index: number) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-default-100 last:border-0"
                    >
                      <td className="py-3 pr-2">
                        <p className="text-xs md:text-sm font-medium text-default-900">
                          {item.description || 'N/A'}
                        </p>
                        {/* {item.type && (
                          <p className="text-xs text-default-500">
                            {item.type}
                          </p>
                        )} */}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <p className="text-xs md:text-sm text-default-700">
                          {formatCurrency(item.rate || 0)}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <p className="text-xs md:text-sm text-default-700">
                          {item.quantity || 'N/A'}
                        </p>
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <p className="text-xs md:text-sm font-semibold text-default-900">
                          {formatCurrency(item.amount || 0)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Other Expenses */}
        {otherExpenses.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-default-700 mb-3">
              Other Expenses
            </h4>
            <div className="space-y-2">
              {otherExpenses.map((expense: any, index: number) => (
                <div
                  key={expense.id || index}
                  className="flex justify-between py-2 border-b border-default-100 last:border-0"
                >
                  <span className="text-xs md:text-sm text-default-700">
                    {expense.description}
                  </span>
                  <span className="text-xs md:text-sm font-semibold text-default-900">
                    {formatCurrency(expense.amount)}
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
            <span className="text-primary-100">Subtotal</span>
            <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
          </div>

          {/* VAT */}
          {sale.includeVAT && sale.vatAmount && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">
                <span className="bg-secondary text-white text-xs md:text-sm px-1.5 py-0.5 rounded mr-1">
                  7.5%
                </span>
                VAT
              </span>
              <span className="font-medium">
                {formatCurrency(sale.vatAmount)}
              </span>
            </div>
          )}

          {/* Discount */}
          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-primary-100">
                Discount
                {sale.discountType === 'PERCENTAGE' && sale.discountValue && (
                  <span className="ml-1">({sale.discountValue}%)</span>
                )}
              </span>
              <span className="font-medium text-danger">
                -{formatCurrency(sale.discountAmount)}
              </span>
            </div>
          )}

          {/* Delivery Cost */}
          {sale.deliveryCost > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-primary-100">Delivery Cost</span>
              <span className="font-medium">
                {formatCurrency(sale.deliveryCost)}
              </span>
            </div>
          )}

          {/* Other Expenses Total */}
          {otherExpenses.length > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-primary-100">Other Expenses</span>
              <span className="font-medium">
                {formatCurrency(sale.totalSaleExpenses - sale.deliveryCost)}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between text-sm md:text-base font-bold pt-3 mt-3 border-t border-default-200">
            <span className="text-primary-500">GRAND TOTAL</span>
            <span className="text-default-900">
              {formatCurrency(sale.totalAmount)}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
