// lib/auth/logout.ts
import { signOut } from 'next-auth/react';

const clearAllZustandStores = () => {
  const keys = Object.keys(localStorage);

  keys.forEach(key => {
    if (
      key.endsWith('-storage') ||
      key.includes('invoice-storage') ||
      key.includes('customer-storage') ||
      key.includes('sale-storage') ||
      key.includes('quotation-storage') ||
      key.includes('purchase-storage')
    ) {
      localStorage.removeItem(key);
    }
  });

  console.log('All Zustand stores cleared');
};

export const handleSignOut = async () => {
  try {
    clearAllZustandStores();
    await signOut({
      callbackUrl: '/account',
      redirect: true,
    });
  } catch (error) {
    console.error('Error during sign out:', error);
    window.location.href = '/account';
  }
};
