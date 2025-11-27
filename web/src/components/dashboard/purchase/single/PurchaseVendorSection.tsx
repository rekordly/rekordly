'use client';

import { Card, CardBody } from '@heroui/react';
import { Building2, Mail, Phone, User } from 'lucide-react';

import { Purchase } from '@/types/purchases';

interface PurchaseVendorSectionProps {
  purchase: Purchase;
}

export function PurchaseVendorSection({
  purchase,
}: PurchaseVendorSectionProps) {
  return (
    <Card className="rounded-2xl" shadow="none">
      <CardBody className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Vendor Information</h3>
        </div>

        <div className="space-y-4">
          {/* Vendor Name */}
          <div>
            <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
              Vendor Name
            </p>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-default-400" />
              <p className="text-sm font-medium text-foreground">
                {purchase.vendorName || 'Not specified'}
              </p>
            </div>
          </div>

          {/* Vendor Email */}
          {purchase.vendorEmail && (
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Email Address
              </p>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-default-400" />
                <p className="text-sm font-medium text-foreground">
                  {purchase.vendorEmail}
                </p>
              </div>
            </div>
          )}

          {/* Vendor Phone */}
          {purchase.vendorPhone && (
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Phone Number
              </p>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-default-400" />
                <p className="text-sm font-medium text-foreground">
                  {purchase.vendorPhone}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
