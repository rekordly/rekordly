import React from 'react';
import { Textarea, Select, SelectItem } from '@heroui/react';
import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { businessCategories, registrationTypes } from '../constant';

interface BusinessOwnerFormProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const BusinessOwnerForm = ({ formData, setFormData, errors }: BusinessOwnerFormProps) => (
  <div className="space-y-4">
    <CustomSelect
      label="Industry"
      options={businessCategories.selfEmployed}
      selectedKeys={formData.industry ? [formData.industry] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, industry: Array.from(keys)[0] })}
      error={errors.industry}
    />

    <CustomSelect
      label="Company Registration Type"
      options={registrationTypes.full}
      selectedKeys={formData.registrationType ? [formData.registrationType] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, registrationType: Array.from(keys)[0] })}
      error={errors.registrationType}
    />

    <CustomInput
      label="Company Name"
      value={formData.companyName}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, companyName: e.target.value })}
      isRequired
      error={errors.companyName}
    />

    <div className="mb-4">
      <Textarea
        label="Brief description of your business"
        variant="bordered"
        maxLength={150}
        value={formData.description}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
        classNames={{
          inputWrapper: "border-1 border-default-300 rounded-2xl",
          label: "font-light text-default-400"
        }}
        isInvalid={!!errors.description}
        errorMessage={errors.description}
      />
    </div>

    <CustomInput
      label="When did you start the business?"
      type="date"
      value={formData.startDate}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, startDate: e.target.value })}
      error={errors.startDate}
    />

    <CustomSelect
      label="Number of employees"
      options={['1', '2-5', '6-10', '11-20', '21-50', '50+']}
      selectedKeys={formData.employeeCount ? [formData.employeeCount] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, employeeCount: Array.from(keys)[0] })}
      error={errors.employeeCount}
    />

    <div className="mb-4">
      <Select
        label="Select earning methods"
        selectionMode="multiple"
        variant="bordered"
        selectedKeys={formData.earningMethods || []}
        onSelectionChange={(keys) => setFormData({ 
          ...formData, 
          earningMethods: typeof keys === 'string' ? [keys] : Array.from(keys as Set<string>) 
        })}
        classNames={{
          trigger: "border-1 h-14 border-default-300 rounded-2xl",
          label: "font-light text-default-400"
        }}
        isInvalid={!!errors.earningMethods}
        errorMessage={errors.earningMethods}
      >
        <SelectItem key="products">Selling products</SelectItem>
        <SelectItem key="services">Providing services</SelectItem>
        <SelectItem key="interest">Interest from investments</SelectItem>
        <SelectItem key="rental">Rental income</SelectItem>
        <SelectItem key="royalties">Royalties</SelectItem>
        <SelectItem key="dividends">Dividends</SelectItem>
        <SelectItem key="other">Other</SelectItem>
      </Select>
    </div>
  </div>
);