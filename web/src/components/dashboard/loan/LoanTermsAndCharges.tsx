'use client';

import { Card, CardBody } from '@heroui/card';
import { Accordion, AccordionItem } from '@heroui/react';
import { useFormContext } from 'react-hook-form';

import { DropdownInput, NumberInput, TextInput } from '@/components/ui/Input';

export function LoanTermsAndCharges() {
  const { control } = useFormContext();

  return (
    <div className="space-y-4">
      {/* Loan Amount Card */}
      <Card
        className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
        shadow="none"
      >
        <CardBody className="p-0">
          <div className="space-y-3 py-2">
            <div className="space-y-2 px-2">
              <h4 className="text-base font-semibold text-foreground">
                Loan Amount
              </h4>
            </div>

            <NumberInput
              isRequired
              control={control}
              label="Principal Amount"
              name="principalAmount"
              placeholder="0.00"
              description="The main loan amount (excluding fees and interest)"
            />

            <NumberInput
              isRequired
              control={control}
              label="Interest Rate (%)"
              name="interestRate"
              placeholder="0.00"
              description="Annual interest rate"
              max={100}
            />
          </div>
        </CardBody>
      </Card>

      {/* Loan Terms Card */}
      <Card
        className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
        shadow="none"
      >
        <CardBody className="p-0">
          <div className="space-y-3 py-2">
            <div className="space-y-2 px-2">
              <h4 className="text-base font-semibold text-foreground">
                Loan Terms
              </h4>
            </div>

            <DropdownInput
              isRequired
              control={control}
              label="Payment Frequency"
              name="paymentFrequency"
              items={[
                { label: 'Daily', value: 'DAILY' },
                { label: 'Weekly', value: 'WEEKLY' },
                { label: 'Bi-weekly', value: 'BIWEEKLY' },
                { label: 'Monthly', value: 'MONTHLY' },
                { label: 'Quarterly', value: 'QUARTERLY' },
                { label: 'Annually', value: 'ANNUALLY' },
                { label: 'One-time', value: 'ONE_TIME' },
              ]}
            />

            <TextInput
              isRequired
              control={control}
              label="Start Date"
              name="startDate"
              type="date"
              description="When the loan starts"
            />

            <div className="grid md:grid-cols-2 gap-4">
              <NumberInput
                isRequired
                control={control}
                label="Term"
                name="term"
                placeholder="12"
                description="Loan duration"
              />

              <DropdownInput
                isRequired
                control={control}
                label="Term Unit"
                name="termUnit"
                items={[
                  { label: 'Days', value: 'DAYS' },
                  { label: 'Months', value: 'MONTHS' },
                  { label: 'Years', value: 'YEARS' },
                ]}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Loan Charges/Fees Section in Accordion */}
      <Card
        className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
        shadow="none"
      >
        <CardBody className="p-0">
          <Accordion variant="light">
            <AccordionItem
              key="charges"
              aria-label="Loan Charges & Fees"
              title="Loan Charges & Fees (Optional)"
              subtitle="Click to add additional charges"
              classNames={{
                title: 'font-semibold',
                subtitle: 'text-xs',
                trigger: 'py-0',
              }}
            >
              <div className="space-y-4 pb-2">
                <p className="text-xs text-default-500">
                  Additional charges apart from interest (if any)
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <NumberInput
                    control={control}
                    label="Processing Fee"
                    name="processingFee"
                    placeholder="0.00"
                    description="One-time processing charge"
                  />

                  <NumberInput
                    control={control}
                    label="Management Fee"
                    name="managementFee"
                    placeholder="0.00"
                    description="Loan management charges"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <NumberInput
                    control={control}
                    label="Insurance Fee"
                    name="insuranceFee"
                    placeholder="0.00"
                    description="Loan insurance (if applicable)"
                  />

                  <NumberInput
                    control={control}
                    label="Other Charges"
                    name="otherCharges"
                    placeholder="0.00"
                    description="Any other fees"
                  />
                </div>
              </div>
            </AccordionItem>
          </Accordion>
        </CardBody>
      </Card>
    </div>
  );
}
