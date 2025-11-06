import React from 'react';

interface FormFieldProps {
  label?: string;
  error?: string;
  children: React.ReactNode;
}

export const FormField = ({ label, error, children }: FormFieldProps) => (
  <div className="mb-4">
    {children}
    {error && <p className="text-sm text-danger mt-1">{error}</p>}
  </div>
);
