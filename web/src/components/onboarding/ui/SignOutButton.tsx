import React from 'react';

interface SignOutButtonProps {
  onSignOut: () => void;
}

export const SignOutButton = ({ onSignOut }: SignOutButtonProps) => (
  <button 
    onClick={onSignOut}
    className="absolute top-4 right-4 text-sm text-default-500 hover:text-primary transition-colors z-50"
  >
    Sign out
  </button>
);