'use client';

import { Card, CardBody, Avatar } from '@heroui/react';
import { Envelope, Phone } from '@phosphor-icons/react';

import { Invoice } from '@/types/invoices';

interface InvoiceCustomerSectionProps {
  invoice: Invoice;
}

export default function InvoiceCustomerSection({
  invoice,
}: InvoiceCustomerSectionProps) {
  const customerName = invoice.customer?.name || invoice.customerName || 'N/A';
  const customerEmail = invoice.customer?.email || invoice.customerEmail;
  const customerPhone = invoice.customer?.phone || invoice.customerPhone;

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (name === 'N/A') return 'NA';

    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className="w-full rounded-xl" shadow="none">
      <CardBody className="p-4">
        <p className="text-xs md:text-sm text-default-400 uppercase tracking-wider mb-3">
          Billed To
        </p>

        <div className="flex items-start gap-3">
          <Avatar
            className="bg-gradient-to-br from-primary-400 to-primary-600 text-white font-semibold flex-shrink-0"
            name={getInitials(customerName)}
            size="md"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm md:text-base font-bold text-default-900 mb-2">
              {customerName}
            </p>

            <div className="space-y-1.5">
              {customerEmail && (
                <div className="flex items-center gap-2 text-xs md:text-sm text-default-600">
                  <Envelope
                    className="text-default-400 flex-shrink-0"
                    size={14}
                  />
                  <span className="truncate">{customerEmail}</span>
                </div>
              )}

              {customerPhone && (
                <div className="flex items-center gap-2 text-xs md:text-sm text-default-600">
                  <Phone className="text-default-400 flex-shrink-0" size={14} />
                  <span>{customerPhone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
