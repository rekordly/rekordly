import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { registrationTypes } from '@/components/onboarding/constant';

interface DigitalTraderFormProps {
  formData: any;
  setFormData: (data: any) => void;
  errors: any;
}

export const DigitalTraderForm = ({ formData, setFormData, errors }: DigitalTraderFormProps) => (
  <div className="space-y-4">
    <CustomSelect
      label="Type of Digital Assets"
      options={['Cryptocurrency (Bitcoin, Ethereum, etc.)', 'NFTs (Non-Fungible Tokens)', 'Tokens (Security, utility, governance)', 'Other digital assets']}
      selectedKeys={formData.assetType ? [formData.assetType] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, assetType: Array.from(keys)[0] })}
      error={errors.assetType}
    />

    <CustomSelect
      label="Business Registration Type"
      options={registrationTypes.extended}
      selectedKeys={formData.registrationType ? [formData.registrationType] : []}
      onSelectionChange={(keys: Set<string>) => setFormData({ ...formData, registrationType: Array.from(keys)[0] })}
      error={errors.registrationType}
    />

    <CustomInput
      label="Trading Platforms"
      placeholder="e.g., Binance, Coinbase"
      value={formData.platforms}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, platforms: e.target.value })}
      error={errors.platforms}
    />

    <CustomInput
      label="When did you start trading?"
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
        <SelectItem key="trading">Buying and selling for profit</SelectItem>
        <SelectItem key="staking">Staking rewards</SelectItem>
        <SelectItem key="mining">Mining rewards</SelectItem>
        <SelectItem key="airdrops">Airdrops</SelectItem>
        <SelectItem key="other">Other</SelectItem>
      </Select>
    </div>
  </div>
);