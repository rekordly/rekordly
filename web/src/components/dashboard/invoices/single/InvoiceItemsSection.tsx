'use client';

import { Card, CardBody } from '@heroui/react';

import { formatCurrency } from '@/lib/fn';
import { Invoice, InvoiceItemType } from '@/types/invoices';

interface InvoiceItemsSectionProps {
  invoice: Invoice;
}

export default function InvoiceItemsSection({
  invoice,
}: InvoiceItemsSectionProps) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <Card className="w-full bg-brand-background rounded-3xl p-4" shadow="none">
      <CardBody className="p-0">
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-default-200">
                  <th className="text-left text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 pr-2">
                    Description
                  </th>
                  <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 px-2">
                    Rate
                  </th>
                  <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 px-2">
                    Qty
                  </th>
                  <th className="text-center text-xs md:text-sm font-semibold text-default-800 uppercase pb-3 pl-2">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: InvoiceItemType, index: number) => (
                  <tr
                    key={index}
                    className="border-b border-default-100 last:border-0"
                  >
                    <td className="py-3 pr-2">
                      <p className="text-xs md:text-sm font-medium text-default-900">
                        {item.description || 'Item'}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <p className="text-xs md:text-sm text-default-700">
                        {formatCurrency(item.rate || 0)}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <p className="text-xs md:text-sm text-default-700">
                        {item.quantity}
                      </p>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <p className="text-xs md:text-sm font-semibold text-default-900">
                        {formatCurrency(
                          item.amount || item.quantity * (item.rate || 0)
                        )}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-4 mt-4 space-y-2.5 border-t border-default-200 ">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-default-600">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(invoice.amount)}
                </span>
              </div>
              {invoice.includeVAT && invoice.vatAmount && (
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-default-600">
                    <span className="bg-secondary text-white text-xs md:text-sm px-1.5 py-0.5 rounded mr-1">
                      7.5%
                    </span>
                    VAT
                  </span>
                  <span className="font-medium">
                    {formatCurrency(invoice.vatAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm md:text-base font-bold pt-3 mt-3 border-t border-secondary-200">
                <span className="text-primary-400">GRAND TOTAL</span>
                <span className="text-default-900">
                  {formatCurrency(invoice.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-default-500 text-center py-4">
            No items found
          </p>
        )}
      </CardBody>
    </Card>
  );
}
