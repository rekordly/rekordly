"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { Link } from "@heroui/link";
import { Plus, Receipt, TrendingDown, TrendingUp, X } from "lucide-react";

interface ActionItem {
  icon: React.ReactNode;
  label: string;
  color: string;
  href: string;
}

export function QuickAction() {
  const [isOpen, setIsOpen] = useState(false);

  const actions: ActionItem[] = [
    {
      icon: <Receipt className="w-5 h-5" />,
      label: "Add Invoice",
      color: "bg-blue-500",
      href: "/dashboard/invoice/new",
    },
    {
      icon: <TrendingDown className="w-5 h-5" />,
      label: "Add Expense",
      color: "bg-red-500",
      href: "/dashboard/expenses/new",
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      label: "Add Sale",
      color: "bg-green-500",
      href: "/dashboard/sales/new",
    },
  ];

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleActionClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <>
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
        {/* Action Items */}
        <div className="fixed bottom-24 right-6 z-50 flex flex-col-reverse gap-3">
          {actions.map((action, index) => (
            <div
              key={action.label}
              className={`transform transition-all duration-300 ease-out ${
                isOpen
                  ? "translate-y-0 opacity-100 scale-100"
                  : "translate-y-8 opacity-0 scale-50 pointer-events-none"
              }`}
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : "0ms",
              }}
            >
              <Link
                href={action.href}
                onClick={handleActionClick}
                className="flex items-center gap-3 group no-underline"
              >
                {/* Combined Button with Icon and Text */}
                <div
                  className={`${action.color} flex items-center gap-3 pl-4 pr-5 py-3 rounded-full text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 min-w-fit`}
                >
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">
                    {action.label}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
        </>
      )}


      {/* Main Button */}
      <Button
        isIconOnly
        radius="full"
        size="lg"
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 bg-gradient-to-r from-primary-300 to-primary-600 hover:from-primary-400 hover:to-primary-700 shadow-2xl transform transition-all duration-300 ${
          isOpen ? "rotate-45 scale-110" : "rotate-0 scale-100"
        }`}
        onPress={handleToggle}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-white" />
        )}
      </Button>
    </>
  );
}