'use client';

import { Card, CardBody } from '@heroui/react';
import { Mail, Phone, User as UserIcon } from 'lucide-react';

interface CustomerInfoSectionProps {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string;
  icon?: React.ReactNode;
  iconColor?: string;
}

export function CustomerInfoSection({
  name,
  email,
  phone,
  title = 'Customer Information',
  icon,
  iconColor = 'text-primary',
}: CustomerInfoSectionProps) {
  const defaultIcon = <UserIcon className={`w-5 h-5 ${iconColor}`} />;

  return (
    <Card className="rounded-2xl" shadow="none">
      <CardBody className="p-6">
        <div className="flex items-center gap-2 mb-6">
          {icon || defaultIcon}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        <div className="space-y-4">
          {/* Customer Name */}
          <div>
            <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
              Customer Name
            </p>
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-default-400" />
              <p className="text-sm font-medium text-foreground">
                {name || 'Not specified'}
              </p>
            </div>
          </div>

          {/* Customer Email */}
          {email && (
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Email Address
              </p>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-default-400" />
                <p className="text-sm font-medium text-foreground">{email}</p>
              </div>
            </div>
          )}

          {/* Customer Phone */}
          {phone && (
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Phone Number
              </p>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-default-400" />
                <p className="text-sm font-medium text-foreground">{phone}</p>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
