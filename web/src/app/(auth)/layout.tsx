import React from 'react';
import { Image } from '@heroui/image';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-h-screen flex flex-col md:flex-row overflow-hidden">
      <div className="hidden md:flex flex-1 max-h-screen overflow-hidden">
        <Image className="object-fill" src="/illustration.svg" />
      </div>

      <div className="w-full md:w-5/12 overflow-y-auto">{children}</div>
    </div>
  );
}
