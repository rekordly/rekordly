import React from 'react';
import { Checkbox } from '@heroui/react';

interface FinalConfirmationProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const FinalConfirmation = ({ formData, setFormData, errors }: FinalConfirmationProps) => (
  <div className="space-y-4 mt-8 pt-6 border-t border-default-200">
    <h3 className="text-lg font-semibold mb-4">Final Confirmation</h3>
    
    <Checkbox
      isSelected={formData.confirmAccuracy}
      onValueChange={(checked) => setFormData({ ...formData, confirmAccuracy: checked })}
      classNames={{ label: "text-sm" }}
      isInvalid={!!errors.confirmAccuracy}
    >
      I confirm that all information provided is accurate
    </Checkbox>

    <Checkbox
      isSelected={formData.confirmNotifications}
      onValueChange={(checked) => setFormData({ ...formData, confirmNotifications: checked })}
      classNames={{ label: "text-sm" }}
    >
      I agree to receive notifications about my income and tax calculations
    </Checkbox>

    <Checkbox
      isSelected={formData.confirmTerms}
      onValueChange={(checked) => setFormData({ ...formData, confirmTerms: checked })}
      classNames={{ label: "text-sm" }}
      isInvalid={!!errors.confirmTerms}
    >
      I have read and agree to the{' '}
      <a href="/terms" className="text-primary hover:underline">Terms of Service</a>
      {' '}and{' '}
      <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
    </Checkbox>

    {errors.confirmations && <p className="text-danger text-sm">{errors.confirmations}</p>}
  </div>
);