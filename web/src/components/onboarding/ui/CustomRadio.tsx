import React from 'react';
import { useRadio, VisuallyHidden, cn } from '@heroui/react';

interface CustomRadioProps {
  value: string;
  children: React.ReactNode;
  description?: string;
}

export const CustomRadio: React.FC<CustomRadioProps> = props => {
  const {
    Component,
    children,
    description,
    getBaseProps,
    getWrapperProps,
    getInputProps,
    getLabelProps,
    getLabelWrapperProps,
    getControlProps,
  } = useRadio(props);

  return (
    <Component
      {...getBaseProps()}
      className={cn(
        'group inline-flex items-center hover:opacity-70 active:opacity-50 justify-between flex-row-reverse tap-highlight-transparent',
        'w-full cursor-pointer border-2 border-default-200 rounded-2xl gap-4 p-4 mb-3',
        'data-[selected=true]:border-primary'
      )}
    >
      <VisuallyHidden>
        <input {...getInputProps()} />
      </VisuallyHidden>
      <span {...getWrapperProps()}>
        <span {...getControlProps()} />
      </span>
      <div {...getLabelWrapperProps()} className="flex flex-col gap-1">
        {children && (
          <span {...getLabelProps()} className="text-base font-semibold">
            {children}
          </span>
        )}
        {description && (
          <span className="text-sm text-default-500">{description}</span>
        )}
      </div>
    </Component>
  );
};
