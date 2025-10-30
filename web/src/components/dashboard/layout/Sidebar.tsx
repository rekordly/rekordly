"use client";

import { menuItems } from '@/config/menu';

import { Button } from '@heroui/react';
import { LogOut } from 'lucide-react';
import { MenuItemLink } from '../MenuItemLinkProps ';
import { signOut } from 'next-auth/react';

export function Sidebar() {

  const handleSignOut = () => signOut({ callbackUrl: '/account' });

  return (
    <aside className="w-64 h-[calc(100vh-64px)] flex flex-col">
      {/* Scrollable navigation area */}
      <nav className="flex-1 overflow-y-auto p-4 pt-8">
        <div className="flex flex-col gap-1">
          {menuItems.map((item, index) => (
            <MenuItemLink key={index} item={item} />
          ))}
        </div>
      </nav>
      
      {/* Fixed Sign Out button at bottom */}
      <div className="flex-none p-4 border-t border-primary-200/40">
        <Button 
          color="danger" 
          variant="flat"
          onPress={handleSignOut}
          className="w-full"
          startContent={<LogOut className="w-4 h-4" />}
        >
          Sign Out
        </Button>
      </div>
    </aside>
  );
}