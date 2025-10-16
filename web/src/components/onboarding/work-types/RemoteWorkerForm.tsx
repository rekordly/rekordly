import React from 'react';
import { Radio, RadioGroup, Select, SelectItem } from '@heroui/react';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomInput } from '../ui/CustomInput';

interface RemoteWorkerFormProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const RemoteWorkerForm = ({ formData, setFormData, errors }: RemoteWorkerFormProps) => (
  <div className="space-y-4">
    <CustomSelect
      label="Industry"
      options={['Technology & IT', 'Finance & Banking', 'Customer Service', 'Marketing & Communications', 'Administration & Operations', 'Creative & Design', 'Education & Training', 'Healthcare', 'Other']}
      selectedKeys={formData.industry ? [formData.industry] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, industry: Array.from(keys)[0] })}
      error={errors.industry}
    />

    <div className="mb-4">
      <RadioGroup
        value={formData.employmentType}
        onValueChange={(value) => setFormData({ ...formData, employmentType: value })}
        label="Employment Type"
        isInvalid={!!errors.employmentType}
        errorMessage={errors.employmentType}
      >
        <Radio value="full-time">Full-time employee</Radio>
        <Radio value="part-time">Part-time employee</Radio>
        <Radio value="contract">Contract worker</Radio>
      </RadioGroup>
    </div>

    <CustomInput
      label="When did you start this job?"
      type="date"
      value={formData.startDate}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, startDate: e.target.value })}
      error={errors.startDate}
    />

    <div className="mb-4">
      <Select
        label="Select payment methods"
        selectionMode="multiple"
        variant="bordered"
        selectedKeys={formData.paymentMethods || []}
        onSelectionChange={(keys) => setFormData({ ...formData, paymentMethods: Array.from(keys) })}
        classNames={{
          trigger: "border-1 h-14 border-default-300 rounded-2xl",
          label: "font-light text-default-400"
        }}
        isInvalid={!!errors.paymentMethods}
        errorMessage={errors.paymentMethods}
      >
        <SelectItem key="salary">Salary/Wages</SelectItem>
        <SelectItem key="allowances">Allowances</SelectItem>
        <SelectItem key="bonuses">Bonuses</SelectItem>
        <SelectItem key="benefits">Benefits-in-kind</SelectItem>
        <SelectItem key="other">Other</SelectItem>
      </Select>
    </div>
  </div>
);