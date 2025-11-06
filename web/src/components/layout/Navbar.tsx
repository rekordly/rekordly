'use client';

import React from 'react';
import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
  NavbarMenuItem,
} from '@heroui/navbar';
import { Link } from '@heroui/link';
import { Button } from '@heroui/button';

interface MenuItem {
  name: string;
  href: string;
}

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const menuItems: MenuItem[] = [
    { name: 'Community', href: '#community' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'FAQs', href: '#faqs' },
    { name: 'Contact', href: '#contact' },
  ];

  return (
    <HeroUINavbar
      className="bg-transparent py-3 px-2"
      classNames={{
        wrapper: 'px-4 sm:px-6 lg:px-8',
      }}
      isBlurred={false}
      maxWidth="full"
      position="sticky"
      onMenuOpenChange={setIsMenuOpen}
    >
      {/* Mobile Menu Toggle & Logo */}
      <NavbarContent>
        <NavbarBrand>
          <p className="font-heading font-bold text-2xl text-brand-foreground">
            Rekordly<span className="text-xs align-super">™</span>
          </p>
        </NavbarBrand>

        {/* Desktop Menu Items */}
        <NavbarContent className="hidden sm:flex gap-8" justify="center">
          {menuItems.map(item => (
            <NavbarItem key={item.name}>
              <Link
                className="text-brand-foreground hover:text-brand transition-colors"
                color="foreground"
                href={item.href}
              >
                {item.name}
              </Link>
            </NavbarItem>
          ))}
        </NavbarContent>
      </NavbarContent>

      {/* CTA Button */}
      <NavbarContent justify="end">
        <NavbarMenuToggle
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          className="sm:hidden text-brand-foreground"
        />
        <NavbarItem>
          <Button
            className="border-2 bg-brand border-brand text-foreground hover:bg-brand hover:text-brand-foreground transition-all font-medium"
            color="default"
            startContent={
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            variant="ghost"
          >
            Join the waitlist
          </Button>
        </NavbarItem>
      </NavbarContent>

      {/* Mobile Menu */}
      <NavbarMenu className="bg-brand-background pt-6">
        {menuItems.map((item, index) => (
          <NavbarMenuItem key={`${item.name}-${index}`}>
            <Link
              className="w-full text-brand-foreground hover:text-brand text-lg py-2"
              color="foreground"
              href={item.href}
              size="lg"
            >
              {item.name}
            </Link>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </HeroUINavbar>
  );
}
