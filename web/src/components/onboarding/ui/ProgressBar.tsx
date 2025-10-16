import React from 'react';

interface ProgressBarProps {
  step: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ step }) => {
  const steps = [
    { number: 1, label: 'Personal Info' },
    { number: 2, label: 'Work Type' },
    { number: 3, label: 'Details' },
  ];

  return (
    <div className="w-full mb-8">
      {/* Mobile: Full width with no padding */}
      <div className="lg:hidden w-full bg-default-100 py-4 px-6">
        <div className="flex items-center justify-between">
          {steps.map((s, index) => (
            <React.Fragment key={s.number}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step >= s.number
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                      : 'bg-default-200 text-default-400'
                  }`}
                >
                  {s.number}
                </div>
                <span className="text-xs mt-1 hidden sm:block">{s.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 h-1 mx-2 bg-default-200 rounded">
                  <div
                    className={`h-full rounded transition-all duration-300 ${
                      step > s.number
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 w-full'
                        : 'w-0'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Desktop: Normal with padding */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, index) => (
            <React.Fragment key={s.number}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    step >= s.number
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                      : 'bg-default-200 text-default-400'
                  }`}
                >
                  {s.number}
                </div>
                <span className="text-sm mt-2">{s.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 h-1 mx-4 bg-default-200 rounded">
                  <div
                    className={`h-full rounded transition-all duration-300 ${
                      step > s.number
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 w-full'
                        : 'w-0'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};