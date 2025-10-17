import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { heardFromOptions } from '../constant';

interface Step1PersonalInfoProps {
  hasPassword: boolean;
  emailDisabled: boolean;
}

export const Step1PersonalInfo: React.FC<Step1PersonalInfoProps> = ({ 
  hasPassword, 
  emailDisabled 
}) => {
  const { register, formState: { errors } } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-6">Basic Information</h2>

      <CustomInput
        label="Full Name"
        placeholder="Rekordly User"
        {...register('fullName')}
        error={errors.fullName?.message as string}
        isRequired
      />

      <CustomInput
        label="Phone Number"
        type="tel"
        placeholder="08000000000"
        {...register('phoneNumber')}
        error={errors.phoneNumber?.message as string}
        isRequired
      />

      <CustomInput
        label="Email Address"
        placeholder="user@rekordly.com"
        type="email"
        {...register('email')}
        error={errors.email?.message as string}
        isRequired
        isDisabled={emailDisabled}
      />

      {!hasPassword && (
        <>
          <CustomInput
            label="Password"
            placeholder="******"
            type={showPassword ? "text" : "password"}
            {...register('password')}
            error={errors.password?.message as string}
            isRequired
            endContent={
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="focus:outline-none"
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            }
          />

          <CustomInput
            label="Confirm Password"
            placeholder="******"
            type={showConfirmPassword ? "text" : "password"}
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message as string}
            isRequired
            endContent={
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="focus:outline-none"
              >
                {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            }
          />
        </>
      )}

      <CustomSelect
        label="How did you hear about us?"
        name="heardFrom"
        options={heardFromOptions}
        error={errors.heardFrom?.message as string}
      />

      <CustomInput
        label="Referral Code (Optional)"
        {...register('referralCode')}
      />
    </div>
  );
};