import React from 'react';
import { Textarea, Select, SelectItem } from '@heroui/react';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomInput } from '../ui/CustomInput';
import { businessCategories, registrationTypes } from '@/components/onboarding/constant';

interface FreelancerFormProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const FreelancerForm = ({ formData, setFormData, errors }: FreelancerFormProps) => (
  <div className="space-y-4">
    <CustomSelect
      label="Type of Freelance Work"
      options={businessCategories.freelancer}
      selectedKeys={formData.freelanceType ? [formData.freelanceType] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, freelanceType: Array.from(keys)[0] })}
      error={errors.freelanceType}
    />

    <CustomSelect
      label="Business Registration Type"
      options={registrationTypes.extended}
      selectedKeys={formData.registrationType ? [formData.registrationType] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, registrationType: Array.from(keys)[0] })}
      error={errors.registrationType}
    />

    <div className="mb-4">
      <Textarea
        label="Brief description of your services"
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
      label="When did you start freelancing?"
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
        onSelectionChange={(keys) => setFormData({ 
          ...formData, 
          earningMethods: typeof keys === "string" ? [keys] : Array.from(keys) 
        })}
        classNames={{
          trigger: "border-1 h-14 border-default-300 rounded-2xl",
          label: "font-light text-default-400"
        }}
        isInvalid={!!errors.earningMethods}
        errorMessage={errors.earningMethods}
      >
        <SelectItem key="project">Project-based payments</SelectItem>
        <SelectItem key="hourly">Hourly rates</SelectItem>
        <SelectItem key="retainer">Monthly retainers</SelectItem>
        <SelectItem key="content">Digital content creation</SelectItem>
        <SelectItem key="teaching">Online teaching</SelectItem>
        <SelectItem key="other">Other</SelectItem>
      </Select>
    </div>
  </div>
);