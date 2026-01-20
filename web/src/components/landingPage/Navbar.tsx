'use client';

import React from 'react';
import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarBrand,
  NavbarItem,
  NavbarMenuItem,
} from '@heroui/navbar';
import { Link } from '@heroui/link';
import { Button } from '@heroui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Receipt } from '@phosphor-icons/react/dist/ssr';
import { Image } from '@heroui/image';
import { ChartNoAxesGantt } from 'lucide-react';
import { WaitlistModal } from '../modals/WaitlistModal';

interface MenuItem {
  name: string;
  href: string;
}

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const menuItems: MenuItem[] = [
    { name: 'How it works', href: '#how-its-works' },
    { name: 'Overview', href: '#overview' },
    { name: 'Features', href: '#features' },
    { name: 'Testimonies', href: '#testimonies' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <HeroUINavbar
      className="bg-background/40 px-2"
      classNames={{
        wrapper: 'px-4 sm:px-6 lg:px-8',
      }}
      // isBlurred={false}
      isMenuOpen={isMenuOpen}
      maxWidth="full"
      position="sticky"
      onMenuOpenChange={setIsMenuOpen}
    >
      <NavbarContent className="max-w-6xl mx-auto">
        {/* Logo - Always on the left */}
        <NavbarContent className="" justify="start">
          <NavbarBrand>
            <div>
              <Image
                src="logo.png"
                height={24}
                width={24}
                alt="Rekordly Logo"
                radius="none"
              />
            </div>
            <p className="font-semibold tracking-tight mt-1 font-heading text-xl text-foreground ms-2">
              Rekordly
            </p>
          </NavbarBrand>
        </NavbarContent>
        {/* Desktop Menu Items - Center (hidden on mobile) */}
        <NavbarContent className="hidden lg:flex gap-8" justify="center">
          {menuItems.map(item => (
            <NavbarItem key={item.name}>
              <Link
                className="text-brand-foreground font-sans text-md hover:text-brand transition-colors"
                color="foreground"
                href={item.href}
              >
                {item.name}
              </Link>
            </NavbarItem>
          ))}
        </NavbarContent>

        {/* Right side content */}
        <NavbarContent justify="end">
          {/* Desktop: Button + Theme Toggle */}
          <NavbarItem className="hidden lg:flex">
            <WaitlistModal />
          </NavbarItem>

          <NavbarItem className="hidden lg:flex">
            <ThemeToggle />
          </NavbarItem>

          {/* Mobile: Theme Toggle + Menu Icon */}
          <NavbarItem className="lg:hidden">
            <ThemeToggle />
          </NavbarItem>

          <NavbarItem className="lg:hidden">
            <button
              className="p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <ChartNoAxesGantt className="size-5" color="white" />
            </button>
          </NavbarItem>
        </NavbarContent>
        {/* Mobile Menu */}
        <NavbarMenu>
          {menuItems.map((item, index) => (
            <NavbarMenuItem key={`${item.name}-${index}`}>
              <Link
                className="w-full"
                color="foreground"
                href={item.href}
                size="lg"
                onPress={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            </NavbarMenuItem>
          ))}

          <WaitlistModal />
        </NavbarMenu>
      </NavbarContent>
    </HeroUINavbar>
  );
}
