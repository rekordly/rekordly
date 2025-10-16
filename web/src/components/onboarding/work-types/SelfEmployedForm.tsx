import React, { useState } from 'react';
import { Textarea, Select, SelectItem } from '@heroui/react';
import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomAutocomplete } from '../ui/CustomAutocomplete';
import { businessCategories, registrationTypes } from '../constant';

interface SelfEmployedFormProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const SelfEmployedForm = ({ formData, setFormData, errors }: SelfEmployedFormProps) => {
  const [showOtherCategory, setShowOtherCategory] = useState(false);

  return (
    <div className="space-y-4">
      <CustomSelect
        label="Type of Business"
        options={businessCategories.selfEmployed}
        selectedKeys={formData.businessType ? [formData.businessType] : []}
        onSelectionChange={(keys: Set<string>) => {
          const value = Array.from(keys)[0];
          setFormData({ ...formData, businessType: value });
          setShowOtherCategory(value === 'Other');
        }}
        error={errors.businessType}
      />

      {showOtherCategory && (
        <CustomAutocomplete
          label="Please specify"
          options={[]}
          allowsCustomValue
          onInputChange={(value: Set<string>) => setFormData({ ...formData, businessTypeOther: value })}
          error={errors.businessTypeOther}
        />
      )}

      <CustomSelect
        label="Business Registration Type"
        options={registrationTypes.basic}
        selectedKeys={formData.registrationType ? [formData.registrationType] : []}
        onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, registrationType: Array.from(keys)[0] })}
        error={errors.registrationType}
      />

      <CustomInput
        label="Business Name (Optional)"
        value={formData.businessName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, businessName: e.target.value })}
      />

      <div className="mb-4">
        <Textarea
          label="Brief description of what you do"
          variant="bordered"
          maxLength={150}
          value={formData.description}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, description: e.target.value })}
          classNames={{
            inputWrapper: "border-1 border-default-300 rounded-2xl",
            label: "font-light text-default-400"
          }}
          isInvalid={!!errors.description}
          errorMessage={errors.description}
        />
      </div>

      <CustomInput
        label="When did you start?"
        type="date"
        value={formData.startDate}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, startDate: e.target.value })}
        error={errors.startDate}
      />

      <div className="mb-4">
        <Select
          label="Select earning methods"
          selectionMode="multiple"
          variant="bordered"
          selectedKeys={formData.earningMethods || []}
          onSelectionChange={(keys) => setFormData({ ...formData, earningMethods: Array.from(keys as Iterable<string>) })}
          classNames={{
            trigger: "border-1 h-14 border-default-300 rounded-2xl",
            label: "font-light text-default-400"
          }}
          isInvalid={!!errors.earningMethods}
          errorMessage={errors.earningMethods}
        >
          <SelectItem key="products">Selling products</SelectItem>
          <SelectItem key="services">Providing services</SelectItem>
          <SelectItem key="rental">Renting out property/equipment</SelectItem>
          <SelectItem key="interest">Interest from loans/investments</SelectItem>
          <SelectItem key="royalties">Royalties from intellectual property</SelectItem>
          <SelectItem key="commissions">Commissions from sales</SelectItem>
          <SelectItem key="other">Other</SelectItem>
        </Select>
      </div>
    </div>
  );
};