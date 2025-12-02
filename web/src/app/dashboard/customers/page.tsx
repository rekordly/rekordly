import { Suspense } from 'react';
import { Card, CardBody } from '@heroui/card';

import CustomerTable from '@/components/tables/CustomerTable';
import { CustomerPageSkeleton } from '@/components/skeleton/CustomerPageSkeleton';

export default function CustomerPage() {
  return (
    <div className="px-0">
      <Card className="rounded-3xl" shadow="none">
        <CardBody className="p-6">
          <Suspense fallback={<CustomerPageSkeleton />}>
            <CustomerTable />
          </Suspense>
        </CardBody>
      </Card>
    </div>
  );
}
