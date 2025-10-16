import React from 'react';
import { SelfEmployedForm } from '@/components/onboarding/work-types/SelfEmployedForm';
import { FreelancerForm } from '@/components/onboarding/work-types/FreelancerForm';
import { RemoteWorkerForm } from '@/components/onboarding/work-types/RemoteWorkerForm';
import { BusinessOwnerForm } from '@/components/onboarding/work-types/BusinessOwnerForm';
import { DigitalTraderForm } from '@/components/onboarding/work-types/DigitalTraderForm';
import { FinalConfirmation } from '@/components/onboarding/FinalConfirmation';

interface Step3DetailsProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const Step3Details = ({ formData, setFormData, errors }: Step3DetailsProps) => {
  const renderWorkTypeForm = () => {
    switch(formData.workType) {
      case 'self-employed':
        return <SelfEmployedForm formData={formData} setFormData={setFormData} errors={errors} />;
      case 'freelancer':
        return <FreelancerForm formData={formData} setFormData={setFormData} errors={errors} />;
      case 'remote-worker':
        return <RemoteWorkerForm formData={formData} setFormData={setFormData} errors={errors} />;
      case 'business-owner':
        return <BusinessOwnerForm formData={formData} setFormData={setFormData} errors={errors} />;
      case 'digital-trader':
        return <DigitalTraderForm formData={formData} setFormData={setFormData} errors={errors} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">Tell us more</h2>
      {renderWorkTypeForm()}
      <FinalConfirmation formData={formData} setFormData={setFormData} errors={errors} />
    </div>
  );
};