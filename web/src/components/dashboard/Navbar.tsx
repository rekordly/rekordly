'use client';

import React from 'react';
import {
  Navbar as HeroUINavbar,
  NavbarBrand,
  NavbarContent,
  Button,
  User,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
} from '@heroui/react';
import { List, SignOut, Receipt } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';

import { ThemeToggle } from '../theme-toggle';
import { MenuItemLink } from './MenuItemLinkProps';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';
import { Link } from '@heroui/link';

import { SessionUser } from '@/types';
import { menuItems } from '@/config/menu';
import { handleSignOut } from '@/lib/auth/logout';
import { ChartNoAxesGantt } from 'lucide-react';

export default function DashboardNavbar({ user }: SessionUser) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isIncomeDrawerOpen, setIsIncomeDrawerOpen] = useState(false);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [incomeType, setIncomeType] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<string | undefined>(undefined);

  const handleToggle = (itemName: string) => {
    setExpandedItem(prev => (prev === itemName ? null : itemName));
  };

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const userName = user?.name || 'Rekordly User';
  const userImage =
    user?.image || 'https://i.pravatar.cc/150?u=a04258114e29026702d';

  // Handle action items (income/expense drawers)
  const handleAction = (actionType: string, action: 'modal' | 'drawer') => {
    const incomeTypes = ['income'];
    const expenseTypes = ['salary-expense', 'rent', 'utilities', 'fuel'];
    const salaryTypes = ['salary-payment'];

    if (incomeTypes.includes(actionType)) {
      setIncomeType(actionType);
      setIsIncomeDrawerOpen(true);
    } else if (expenseTypes.includes(actionType)) {
      setExpenseType(actionType);
      setIsExpenseDrawerOpen(true);
    } else if (salaryTypes.includes(actionType)) {
      setExpenseType('salary');
      setIsExpenseDrawerOpen(true);
    }
  };

  const handleIncomeDrawerClose = () => {
    setIsIncomeDrawerOpen(false);
    setIncomeType(undefined);
  };

  const handleExpenseDrawerClose = () => {
    setIsExpenseDrawerOpen(false);
    setExpenseType(undefined);
  };

  return (
    <>
      <HeroUINavbar
        className="py-1 border-b border-divider/50"
        height="64px"
        isMenuOpen={isMenuOpen}
        maxWidth="full"
        onMenuOpenChange={setIsMenuOpen}
      >
        <NavbarContent>
          <NavbarBrand>
            <div className="w-9 h-9 bg-linear-to-br from-primary to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
              <Receipt weight="duotone" className="w-5 h-5 text-white" />
            </div>
            <p className="font-heading font-bold md:text-xl text-foreground ms-2.5">
              Rekordly<span className="text-xs align-super">™</span>
            </p>
          </NavbarBrand>

          {/* Mobile Toggle with user */}
          <NavbarContent className="sm:hidden gap-0" justify="end">
            <ThemeToggle />
            <Link color="foreground" href="/dashboard/profile">
              <User
                avatarProps={{
                  src: userImage,
                  size: 'sm',
                }}
                description=""
                name=""
              />
            </Link>

            <Button
              isIconOnly
              className="size-6 min-w-auto"
              size="sm"
              variant="light"
              onPress={onOpen}
            >
              <ChartNoAxesGantt className="size-5" />
            </Button>
          </NavbarContent>

          {/* Desktop */}
          <NavbarContent className="hidden sm:flex gap-3" justify="end">
            <ThemeToggle />
            <Link color="foreground" href="/dashboard/profile">
              <User
                avatarProps={{
                  src: userImage,
                }}
                description={user?.email || ''}
                name={userName}
              />
            </Link>
          </NavbarContent>
        </NavbarContent>

        <Drawer
          backdrop="blur"
          isOpen={isOpen}
          motionProps={{
            variants: {
              enter: {
                opacity: 1,
                x: 0,
                transition: {
                  duration: 0.3,
                  ease: 'easeOut',
                },
              },
              exit: {
                x: -100,
                opacity: 0,
                transition: {
                  duration: 0.2,
                  ease: 'easeIn',
                },
              },
            },
          }}
          placement="left"
          size="xs"
          onClose={onClose}
        >
          <DrawerContent>
            {onClose => (
              <div className="flex flex-col h-full bg-linear-to-b from-background to-default-50/30">
                <DrawerHeader className="flex flex-col gap-1 border-b border-divider/50 pb-4">
                  <User
                    avatarProps={{
                      src: userImage,
                      size: 'lg',
                      className: 'ring-2 ring-primary/20',
                    }}
                    classNames={{
                      name: 'font-semibold text-base',
                      description: 'text-default-500 text-sm',
                    }}
                    description={user?.email || ''}
                    name={userName}
                  />
                </DrawerHeader>

                <DrawerBody className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
                  <nav className="flex flex-col gap-0.5">
                    {menuItems.map((item, index) => (
                      <MenuItemLink
                        key={index}
                        expandedItem={expandedItem}
                        item={item}
                        onClose={onClose}
                        onToggle={handleToggle}
                        onAction={handleAction}
                      />
                    ))}
                  </nav>
                </DrawerBody>

                <DrawerFooter className="border-t border-divider/50 pt-4">
                  <Button
                    className="w-full font-semibold"
                    color="danger"
                    startContent={<SignOut weight="bold" className="w-5 h-5" />}
                    variant="flat"
                    onPress={handleSignOut}
                  >
                    Sign Out
                  </Button>
                </DrawerFooter>
              </div>
            )}
          </DrawerContent>
        </Drawer>
      </HeroUINavbar>

      {/* Income Drawer */}
      <AddIncomeDrawer
        isOpen={isIncomeDrawerOpen}
        prefilledType={incomeType}
        onClose={handleIncomeDrawerClose}
        onSuccess={data => {
          console.log('Income added:', data);
          // Refresh data or show success message
        }}
      />

      {/* Expense Drawer */}
      <AddExpensesDrawer
        isOpen={isExpenseDrawerOpen}
        prefilledType={expenseType}
        onClose={handleExpenseDrawerClose}
        onSuccess={data => {
          console.log('Expense added:', data);
          // Refresh data or show success message
        }}
      />
    </>
  );
}
