import React from 'react';
import { Progress } from '@heroui/react';

interface ProgressBarProps {
  step: number;
}

export const ProgressBar = ({ step }: ProgressBarProps) => {
  const progress = (step / 3) * 100;
  return (
    <div className="w-full mb-8">
      <Progress 
        value={progress} 
        className="h-1"
        color="primary"
        classNames={{
          indicator: "bg-gradient-to-r from-blue-500 to-purple-600"
        }}
      />
      <p className="text-sm text-default-500 mt-2">Step {step} of 3</p>
    </div>
  );
};