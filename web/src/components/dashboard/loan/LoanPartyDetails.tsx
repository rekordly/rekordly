'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';

import { DropdownInput, TextInput } from '@/components/ui/Input';

export function LoanPartyDetails() {
  const { control, watch } = useFormContext();

  const loanType = watch('loanType');

  return (
    <Card className="w-full rounded-2xl" shadow="none">
      <CardBody>
        <div className="space-y-4 py-2">
          <div className="space-y-2 px-2">
            <h4 className="text-sm font-semibold text-foreground">
              Loan Information
            </h4>
            <Divider />
          </div>

          {/* Loan Type Selection */}
          <DropdownInput
            isRequired
            control={control}
            label="Loan Type"
            name="loanType"
            description="Are you lending money or borrowing money?"
            items={[
              {
                label: 'Money I Borrowed (Payable)',
                value: 'PAYABLE',
              },
              {
                label: 'Money I Lent (Receivable)',
                value: 'RECEIVABLE',
              },
            ]}
          />

          {/* Party Details */}
          <div className="space-y-2 px-2 pt-4">
            <h4 className="text-sm font-semibold text-foreground">
              {loanType === 'RECEIVABLE'
                ? 'Borrower Details'
                : 'Lender Details'}
            </h4>
            <p className="text-xs text-default-500">
              {loanType === 'RECEIVABLE'
                ? 'Person/company who borrowed money from you'
                : 'Person/company/bank who lent you money'}
            </p>
            <Divider />
          </div>

          <TextInput
            isRequired
            control={control}
            label={loanType === 'RECEIVABLE' ? 'Borrower Name' : 'Lender Name'}
            name="partyName"
            placeholder={
              loanType === 'RECEIVABLE'
                ? 'Enter borrower name'
                : 'Enter lender name (e.g., GTBank, John Doe)'
            }
          />

          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              control={control}
              label={
                loanType === 'RECEIVABLE' ? 'Borrower Phone' : 'Lender Phone'
              }
              name="partyPhone"
              placeholder="08012345678"
              type="tel"
            />

            <TextInput
              control={control}
              label={
                loanType === 'RECEIVABLE' ? 'Borrower Email' : 'Lender Email'
              }
              name="partyEmail"
              placeholder={
                loanType === 'RECEIVABLE'
                  ? 'borrower@example.com'
                  : 'lender@example.com'
              }
              type="email"
            />
          </div>

          {/* Purpose and Collateral */}
          <div className="space-y-2 px-2 pt-4">
            <h4 className="text-sm font-semibold text-foreground">
              Additional Information
            </h4>
            <Divider />
          </div>

          <TextInput
            control={control}
            label="Purpose"
            name="purpose"
            placeholder="e.g., Business expansion, Equipment purchase"
            description="What is this loan for?"
          />

          <TextInput
            control={control}
            label="Collateral"
            name="collateral"
            placeholder="e.g., Property deed, Vehicle"
            description="Any security or collateral for this loan"
          />

          <TextInput
            control={control}
            label="Notes"
            name="notes"
            placeholder="Any additional notes..."
          />
        </div>
      </CardBody>
    </Card>
  );
}
