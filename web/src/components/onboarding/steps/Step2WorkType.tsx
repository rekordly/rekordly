import React from 'react';
import { Radio, RadioGroup } from '@heroui/react';
import { workTypes } from '../constant';


interface Step2WorkTypeProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const Step2WorkType = ({ formData, setFormData, errors }: Step2WorkTypeProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">How do you earn income?</h2>
      
      <RadioGroup
        value={formData.workType}
        onValueChange={(value) => setFormData({ ...formData, workType: value })}
      >
        {workTypes.map((type) => (
          <Radio 
            key={type.value} 
            value={type.value}
            classNames={{
              base: "border-1 border-default-300 rounded-2xl p-4 mb-4 hover:border-primary transition-colors max-w-full",
              wrapper: "group-data-[selected=true]:border-primary"
            }}
          >
            <div className="flex flex-col">
              <span className="font-semibold text-lg">{type.label}</span>
              <span className="text-sm text-default-500">{type.desc}</span>
            </div>
          </Radio>
        ))}
      </RadioGroup>
      
      {errors.workType && <p className="text-danger text-sm">{errors.workType}</p>}
    </div>
  );
};