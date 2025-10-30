"use client";

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
} from "@heroui/react";
import { ChartNoAxesGantt, LogOut, Receipt } from 'lucide-react';
import { SessionUser, MenuItem, SessionFlowProps } from '@/types';
import { MenuItemLink } from './MenuItemLinkProps ';
import { menuItems } from '@/config/menu';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from '../theme-toggle';




interface DashboardNavbarProps {
  user?: SessionUser | null;
}

export default function DashboardNavbar({ user }: SessionUser) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure(); 
  const handleSignOut = () => signOut({ callbackUrl: '/account' });


  // Safe access to session data with fallbacks
  const userName = user?.name || "Rekordly User";
  const userImage = user?.image || "https://i.pravatar.cc/150?u=a04258114e29026702d";

return (
    <HeroUINavbar 
      onMenuOpenChange={setIsMenuOpen}
      isMenuOpen={isMenuOpen}
      maxWidth="full"
      className="py-1"
      height="64px"
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
              size: "sm"
            }}
            description=""
            name=""
          />

          <Button 
            onPress={onOpen} 
            isIconOnly
            variant="light"
            size="sm"
            className='size-6 min-w-auto'
          >
            <ChartNoAxesGantt className="size-5" />
          </Button>
        </NavbarContent>

        {/* Desktop */}
        <NavbarContent className="hidden sm:flex gap-2" justify="end">
          <User
            avatarProps={{
              src: userImage,
            }}
            name={userName}
            description={user?.email || ""}
          />
        </NavbarContent>
      </NavbarContent>

      <Drawer 
        isOpen={isOpen} 
        size="xs"
        onClose={onClose} 
        placement="left"
        backdrop="blur"
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
      >
        <DrawerContent>
          {(onClose) => (
            <div className="flex flex-col h-full">
              <DrawerHeader className="flex flex-col gap-1 border-b border-divider">
                <User
                  avatarProps={{
                    src: userImage,
                    size: "lg"
                  }}
                  name={userName}
                  description={user?.email || ""}
                  classNames={{
                    name: "font-semibold",
                    description: "text-default-500"
                  }}
                />
              </DrawerHeader>
              
              <DrawerBody className="flex-1 overflow-y-auto">
                <nav className="flex flex-col gap-1 py-2">
                  {menuItems.map((item, index) => (
                    <MenuItemLink key={index} item={item} onClose={onClose} />
                  ))}
                </nav>
              </DrawerBody>
              
              <DrawerFooter className="border-t border-divider">
                <Button 
                  color="danger" 
                  variant="flat"
                onPress={handleSignOut}
                  className="w-full"
                  startContent={<LogOut className="w-4 h-4" />}
                >
                  Sign Out
                </Button>
              </DrawerFooter>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </HeroUINavbar>
  );
}