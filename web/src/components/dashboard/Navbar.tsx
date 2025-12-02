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
import { ChartNoAxesGantt, LogOut, Receipt } from 'lucide-react';
import { useState } from 'react';

import { ThemeToggle } from '../theme-toggle';
import { MenuItemLink } from './MenuItemLinkProps';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';

import { SessionUser } from '@/types';
import { menuItems } from '@/config/menu';
import { handleSignOut } from '@/lib/auth/logout';

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
    const incomeTypes = ['salary', 'commission', 'dividend', 'other-income'];
    const expenseTypes = [
      'salary',
      'rent',
      'utilities',
      'fuel',
      'professional-fees',
      'subscriptions',
    ];

    if (incomeTypes.includes(actionType)) {
      setIncomeType(actionType);
      setIsIncomeDrawerOpen(true);
    } else if (expenseTypes.includes(actionType)) {
      setExpenseType(actionType);
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
        className="py-1"
        height="64px"
        isMenuOpen={isMenuOpen}
        maxWidth="full"
        onMenuOpenChange={setIsMenuOpen}
      >
        <NavbarContent>
          <NavbarBrand>
            <div className="size-6 md:size-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
              <Receipt className="size-4 text-white" />
            </div>
            <p className="font-heading font-bold md:text-xl text-foreground ms-2">
              Rekordly<span className="text-xs align-super">™</span>
            </p>
          </NavbarBrand>

          {/* Mobile Toggle with user */}
          <NavbarContent className="sm:hidden gap-0" justify="end">
            <ThemeToggle />
            <User
              avatarProps={{
                src: userImage,
                size: 'sm',
              }}
              description=""
              name=""
            />

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
          <NavbarContent className="hidden sm:flex gap-2" justify="end">
            <ThemeToggle />
            <User
              avatarProps={{
                src: userImage,
              }}
              description={user?.email || ''}
              name={userName}
            />
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
                },
              },
              exit: {
                x: -100,
                opacity: 0,
                transition: {
                  duration: 0.3,
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
              <div className="flex flex-col h-full">
                <DrawerHeader className="flex flex-col gap-1 border-b border-divider">
                  <User
                    avatarProps={{
                      src: userImage,
                      size: 'lg',
                    }}
                    classNames={{
                      name: 'font-semibold',
                      description: 'text-default-500',
                    }}
                    description={user?.email || ''}
                    name={userName}
                  />
                </DrawerHeader>

                <DrawerBody className="flex-1 overflow-y-auto">
                  <nav className="flex flex-col gap-1 py-2">
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

                <DrawerFooter className="border-t border-divider">
                  <Button
                    className="w-full"
                    color="danger"
                    startContent={<LogOut className="w-4 h-4" />}
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
