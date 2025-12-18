'use client';

import { useState } from 'react';
import { Button } from '@heroui/button';
import { Plus } from 'lucide-react';
import { QuickLinksDrawer } from '@/components/modals/QuickLinksModal';

export function QuickAction() {
  const [showQuickLinks, setShowQuickLinks] = useState(false);

  return (
    <>
      {/* Main FAB Button */}
      <Button
        isIconOnly
        className="
          fixed bottom-6 right-6 z-50 w-14 h-14 
          bg-linear-to-br from-primary-400 to-primary-600 
          hover:from-primary-500 hover:to-primary-700 
          shadow-lg hover:shadow-xl
          transform transition-all duration-300 
          hover:scale-110
        "
        radius="full"
        size="lg"
        onPress={() => setShowQuickLinks(true)}
      >
        <Plus className="w-6 h-6 text-white" />
      </Button>

      {/* Quick Links Drawer */}
      <QuickLinksDrawer
        isOpen={showQuickLinks}
        onClose={() => setShowQuickLinks(false)}
      />
    </>
  );
}
