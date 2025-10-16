import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { heardFromOptions } from '../constant';

interface Step1PersonalInfoProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const Step1PersonalInfo = ({ formData, setFormData, errors }: Step1PersonalInfoProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-6">Basic Information</h2>

      <CustomInput
        label="Full Name"
        placeholder="Rekordly User"
        value={formData.fullName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, fullName: e.target.value })}
        error={errors.fullName}
        isRequired
      />

      <CustomInput
        label="Phone Number"
        type="tel"
        placeholder="+234 800 000 0000"
        value={formData.phoneNumber}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, phoneNumber: e.target.value })}
        error={errors.phoneNumber}
        isRequired
      />

      <CustomInput
        label="Email Address"
        placeholder="user@rekordly.com"
        type="email"
        value={formData.email}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value })}
        error={errors.email}
        isRequired
      />

      <CustomInput
        label="Password"
        placeholder="******"
        type={showPassword ? "text" : "password"}
        value={formData.password}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, password: e.target.value })}
        error={errors.password}
        isRequired
        endContent={
        <button type="button" onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      }
      />

      <CustomInput
        label="Confirm Password"
        placeholder="******"
        type={showConfirmPassword ? "text" : "password"}
        value={formData.confirmPassword}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, confirmPassword: e.target.value })}
        error={errors.confirmPassword}
        isRequired
        endContent={
          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
            {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        }
      />

      <CustomSelect
        label="How did you hear about us?"
        options={heardFromOptions}
        selectedKeys={formData.heardFrom ? [formData.heardFrom] : []}
        onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, heardFrom: Array.from(keys)[0] })}
        error={errors.heardFrom}
      />

      <CustomInput
        label="Referral Code (Optional)"
        value={formData.referralCode}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, referralCode: e.target.value })}
      />
    </div>
  );
};