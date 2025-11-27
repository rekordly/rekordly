'use client';

import { useState } from 'react';
import { Button } from '@heroui/button';
import { Plus, Receipt, TrendingDown, TrendingUp } from 'lucide-react';

import { CreateInvoiceDrawer } from '@/components/drawer/CreateInvoiceDrawer';
import { useInvoiceStore } from '@/store/invoiceStore';

interface ActionItem {
  icon: React.ReactNode;
  label: string;
  color: string;
  hoverColor: string;
  action: () => void;
}

export function QuickAction() {
  const [isOpen, setIsOpen] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const { refreshInvoices } = useInvoiceStore();

  const actions: ActionItem[] = [
    {
      icon: <Receipt className="w-5 h-5" />,
      label: 'Invoice',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => {
        setIsOpen(false);
        setShowInvoiceModal(true);
      },
    },
    {
      icon: <TrendingDown className="w-5 h-5" />,
      label: 'Expense',
      color: 'bg-red-500',
      hoverColor: 'hover:bg-red-600',
      action: () => {
        setIsOpen(false);
        // TODO: Open expense modal
        console.log('Open expense modal');
      },
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      label: 'Sale',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      action: () => {
        setIsOpen(false);
        // TODO: Open sale modal
        console.log('Open sale modal');
      },
    },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300">
          {actions.map((action, index) => (
            <button
              key={action.label}
              className={`
                ${action.color} ${action.hoverColor}
                flex items-center gap-3 pl-4 pr-5 py-3 
                rounded-full text-white shadow-lg 
                transform transition-all duration-200 
                hover:scale-105 hover:shadow-xl
                ${
                  isOpen
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-4 opacity-0 pointer-events-none'
                }
              `}
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
              }}
              onClick={action.action}
            >
              <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                {action.icon}
              </div>
              <span className="text-sm font-medium whitespace-nowrap">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main FAB Button */}
      <Button
        isIconOnly
        className={`
          fixed bottom-6 right-6 z-50 w-14 h-14 
          bg-gradient-to-br from-primary-400 to-primary-600 
          hover:from-primary-500 hover:to-primary-700 
          shadow-lg hover:shadow-xl
          transform transition-all duration-300 
          ${isOpen ? 'rotate-45 scale-110' : 'rotate-0 scale-100'}
        `}
        radius="full"
        size="lg"
        onPress={() => setIsOpen(!isOpen)}
      >
        <Plus className="w-6 h-6 text-white" />
      </Button>

      <CreateInvoiceDrawer
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSuccess={async () => {
          await refreshInvoices();
        }}
      />
    </>
  );
}
