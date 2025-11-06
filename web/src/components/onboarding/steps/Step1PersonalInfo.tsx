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
  emailDisabled,
}) => {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-6">Basic Information</h2>

      <CustomInput
        label="Full Name"
        placeholder="Rekordly User"
        {...register('fullName')}
        isRequired
        error={errors.fullName?.message as string}
      />

      <CustomInput
        label="Phone Number"
        placeholder="08000000000"
        type="tel"
        {...register('phoneNumber')}
        isRequired
        error={errors.phoneNumber?.message as string}
      />

      <CustomInput
        label="Email Address"
        placeholder="user@rekordly.com"
        type="email"
        {...register('email')}
        isRequired
        error={errors.email?.message as string}
        isDisabled={emailDisabled}
      />

      {!hasPassword && (
        <>
          <CustomInput
            label="Password"
            placeholder="******"
            type={showPassword ? 'text' : 'password'}
            {...register('password')}
            isRequired
            endContent={
              <button
                className="focus:outline-none"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOffIcon size={16} />
                ) : (
                  <EyeIcon size={16} />
                )}
              </button>
            }
            error={errors.password?.message as string}
          />

          <CustomInput
            label="Confirm Password"
            placeholder="******"
            type={showConfirmPassword ? 'text' : 'password'}
            {...register('confirmPassword')}
            isRequired
            endContent={
              <button
                className="focus:outline-none"
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOffIcon size={16} />
                ) : (
                  <EyeIcon size={16} />
                )}
              </button>
            }
            error={errors.confirmPassword?.message as string}
          />
        </>
      )}

      <CustomSelect
        error={errors.heardFrom?.message as string}
        label="How did you hear about us?"
        name="heardFrom"
        options={heardFromOptions}
      />

      <CustomInput
        label="Referral Code (Optional)"
        {...register('referralCode')}
      />
    </div>
  );
};
