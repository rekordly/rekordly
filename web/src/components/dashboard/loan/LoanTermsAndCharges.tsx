'use client';

import { Card, CardBody } from '@heroui/card';
import { Divider } from '@heroui/divider';
import { Accordion, AccordionItem } from '@heroui/react';
import { useFormContext } from 'react-hook-form';

import { DropdownInput, NumberInput, TextInput } from '@/components/ui/Input';

export function LoanTermsAndCharges() {
  const { control } = useFormContext();

  return (
    <Card className="w-full rounded-2xl" shadow="none">
      <CardBody>
        <div className="space-y-4 py-2">
          {/* Loan Amount Section */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">
              Loan Amount & Terms
            </h4>
            {/* <Divider /> */}
          </div>

          <NumberInput
            isRequired
            control={control}
            label="Principal Amount"
            name="principalAmount"
            placeholder="0.00"
            description="The main loan amount (excluding fees and interest)"
          />

          <div className="grid md:grid-cols-2 gap-4">
            <NumberInput
              isRequired
              control={control}
              label="Interest Rate (%)"
              name="interestRate"
              placeholder="0.00"
              description="Annual interest rate"
              max={100}
            />

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
          </div>

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

          {/* Loan Charges/Fees Section in Accordion */}
          <div className="pt-4">
            <Accordion variant="bordered">
              <AccordionItem
                key="charges"
                aria-label="Loan Charges & Fees"
                title="Loan Charges & Fees (Optional)"
                subtitle="Click to add additional charges"
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
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
