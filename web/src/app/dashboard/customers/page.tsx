'use client';
import { Suspense, useState } from 'react';
import { Card, CardBody } from '@heroui/card';
import { Button } from '@heroui/react';
import { Plus, DollarSign } from 'lucide-react';

import CustomerTable from '@/components/tables/CustomerTable';
import { CustomerPageSkeleton } from '@/components/skeleton/CustomerPageSkeleton';
import StatCard from '@/components/ui/StatCard';

export default function CustomerPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <div className="px-0">
      <Suspense fallback={<CustomerPageSkeleton />}>
        <CustomerTable
          isAddModalOpen={isAddModalOpen}
          setIsAddModalOpen={setIsAddModalOpen}
        />
      </Suspense>
      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6"></CardBody>
      </Card>
    </div>
  );
}
