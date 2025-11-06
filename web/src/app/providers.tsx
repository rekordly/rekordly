// src/app/providers.tsx
'use client';

import type { ThemeProviderProps } from 'next-themes';

import * as React from 'react';
import { HeroUIProvider } from '@heroui/system';
import { ToastProvider } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
  session?: any; // Session from server-side
}

declare module '@react-types/shared' {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>['push']>[1]
    >;
  }
}

export function Providers({ children, themeProps, session }: ProvidersProps) {
  const router = useRouter();

  return (
    <SessionProvider session={session}>
      <HeroUIProvider navigate={router.push}>
        <ToastProvider
          placement="top-right"
          toastOffset={10}
          toastProps={{
            timeout: 3000,
            shouldShowTimeoutProgress: true,
            hideIcon: true,
            // variant: "bordered"
            classNames: {
              closeButton:
                'opacity-100 absolute right-4 top-1/2 -translate-y-1/2',
            },
            closeIcon: (
              <svg
                fill="none"
                height="32"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="32"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ),
          }}
        />
        <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>
      </HeroUIProvider>
    </SessionProvider>
  );
}
