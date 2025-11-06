'use client';

import { Card, CardBody } from '@heroui/react';
import { formatCurrency } from '@/lib/fn';
import { Quotation, MaterialItemType } from '@/types/quotations';

interface QuotationItemsSectionProps {
  quotation: Quotation;
}

export default function QuotationItemsSection({
  quotation,
}: QuotationItemsSectionProps) {
  const materials = Array.isArray(quotation.materials)
    ? quotation.materials
    : [];
  const otherCosts = Array.isArray(quotation.otherCosts)
    ? quotation.otherCosts
    : [];

  return (
    <Card className="w-full rounded-3xl p-4" shadow="none">
      <CardBody className="p-0 space-y-4">
        {/* Materials Section */}
        {materials.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-default-700 mb-3">
              Materials
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
                  {materials.map((item: MaterialItemType, index: number) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-default-100 last:border-0"
                    >
                      <td className="py-3 pr-2">
                        <p className="text-xs md:text-sm font-medium text-default-900">
                          {item.name}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <p className="text-xs md:text-sm text-default-700">
                          {formatCurrency(item.unitPrice)}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <p className="text-xs md:text-sm text-default-700">
                          {item.qty}
                        </p>
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <p className="text-xs md:text-sm font-semibold text-default-900">
                          {formatCurrency(item.total)}
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
          {/* Materials Total */}
          {quotation.materialsTotal > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">Materials</span>
              <span className="font-medium">
                {formatCurrency(quotation.materialsTotal)}
              </span>
            </div>
          )}

          {/* Other Costs Total */}
          {quotation.otherCostsTotal > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">Other Costs</span>
              <span className="font-medium">
                {formatCurrency(quotation.otherCostsTotal)}
              </span>
            </div>
          )}

          {/* Workmanship */}
          {quotation.workmanship > 0 && (
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-default-600">Workmanship</span>
              <span className="font-medium">
                {formatCurrency(quotation.workmanship)}
              </span>
            </div>
          )}

          {/* VAT */}
          {quotation.includeVAT && quotation.vatAmount && (
            <div className="flex justify-between text-xs md:text-sm pt-2 border-t border-default-100">
              <span className="text-default-600">
                <span className="bg-secondary text-white text-xs md:text-sm px-1.5 py-0.5 rounded mr-1">
                  7.5%
                </span>
                VAT
              </span>
              <span className="font-medium">
                {formatCurrency(quotation.vatAmount)}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between text-sm md:text-base font-bold pt-3 mt-3 border-t border-secondary-200">
            <span className="text-primary-400">GRAND TOTAL</span>
            <span className="text-default-900">
              {formatCurrency(quotation.totalAmount)}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
