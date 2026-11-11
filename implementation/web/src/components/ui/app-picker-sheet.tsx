'use client';

import React, { useState, useMemo } from 'react';
import { Sheet } from '@heroui/react';
import { Check, MagnifyingGlass, X } from '@phosphor-icons/react';

export interface AppPickerItem {
  id: string;
  label: string;
  description?: string;
  category?: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface AppPickerSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: string;
  items: AppPickerItem[];
  selectedId?: string | null;
  onSelect: (item: AppPickerItem) => void;
  searchPlaceholder?: string;
  categories?: string[];
}

export function AppPickerSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  items,
  selectedId,
  onSelect,
  searchPlaceholder = 'Search items...',
  categories,
}: AppPickerSheetProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const availableCategories = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    const cats = new Set<string>();
    items.forEach((item) => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats);
  }, [categories, items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        q.length === 0 ||
        item.label.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q));

      const matchesCat = !activeCategory || item.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [items, search, activeCategory]);

  return (
    <Sheet.Root isOpen={isOpen} onOpenChange={onOpenChange}>
      <Sheet.Backdrop className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 transition-opacity" />
      <Sheet.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex flex-col rounded-t-3xl border-t border-border bg-overlay p-6 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:mx-auto">
        <Sheet.Dialog className="flex flex-col h-full outline-none">
          <Sheet.Handle className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
          <Sheet.Header className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <Sheet.Heading className="font-heading text-base font-semibold text-foreground">
                {title}
              </Sheet.Heading>
              {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
            </div>
            <Sheet.CloseTrigger className="rounded-full p-1 text-muted hover:text-foreground cursor-pointer transition-colors">
              <X size={18} weight="bold" />
            </Sheet.CloseTrigger>
          </Sheet.Header>

          <div className="pt-3 pb-2 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-field-border bg-field px-3 py-2 text-xs focus-within:border-accent">
              <MagnifyingGlass size={16} weight="bold" className="text-muted shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs font-medium text-foreground placeholder:text-muted outline-none border-none shadow-none focus:ring-0"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-muted hover:text-foreground p-0.5 cursor-pointer"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>

            {availableCategories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                    activeCategory === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface text-muted hover:text-foreground'
                  }`}
                >
                  All
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface text-muted hover:text-foreground'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Sheet.Body className="flex-1 overflow-y-auto py-2 space-y-1.5 max-h-[50vh] pr-1">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">No items found</div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-xs'
                        : 'border-border/60 bg-surface/50 hover:bg-surface hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.icon && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-field text-foreground">
                          {item.icon}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-xs font-semibold text-foreground truncate">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="rounded-md bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-muted truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={12} weight="bold" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </Sheet.Body>
        </Sheet.Dialog>
      </Sheet.Content>
    </Sheet.Root>
  );
}
