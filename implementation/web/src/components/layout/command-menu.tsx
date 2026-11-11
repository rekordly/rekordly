"use client";

import { Kbd, Modal } from "@heroui/react";
import { ArrowUpRight, MagnifyingGlass, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useNavigation } from "./use-navigation";
import { useUIStore, type MoneyRecordDirection } from "@/stores/ui-store";

interface Command {
  key: string;
  label: string;
  description: string;
  href?: string;
  direction?: MoneyRecordDirection;
  icon: PhosphorIcon;
}

export function CommandMenu() {
  const router = useRouter();
  const openMoneyRecord = useUIStore((state) => state.openMoneyRecord);
  const { groups, addActions } = useNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const commands = useMemo<Command[]>(
    () => [
      ...groups.flatMap((group) =>
        group.items.map((item) => ({
          key: `nav-${item.href}`,
          label: item.label,
          description: group.title,
          href: item.href,
          icon: item.icon,
        })),
      ),
      ...addActions.map((action) => ({
        key: `add-${action.direction}`,
        label: action.label,
        description: action.description,
        direction: action.direction,
        icon: action.icon,
      })),
    ],
    [addActions, groups],
  );

  const visible = useMemo(
    () =>
      commands.filter((item) =>
        `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [commands, query],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isTyping =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.key === "/" && !isTyping) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const choose = (command: Command) => {
    if (command.direction) openMoneyRecord(command.direction);
    else if (command.href) router.push(command.href);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 w-full max-w-[420px] cursor-pointer items-center gap-2.5 rounded-full bg-background px-4 text-left text-[13px] text-field-placeholder transition-colors hover:bg-surface-secondary md:flex"
      >
        <MagnifyingGlass size={18} className="text-muted" aria-hidden="true" />
        <span className="flex-1 truncate">Search pages and actions…</span>
        <Kbd className="text-[11px]">
          <Kbd.Abbr keyValue="ctrl" />
          <Kbd.Content>K</Kbd.Content>
        </Kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages and actions"
        className="grid size-10 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-default md:hidden"
      >
        <MagnifyingGlass size={20} aria-hidden="true" />
      </button>

      <Modal isOpen={open} onOpenChange={setOpen}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog aria-label="Search" className="overflow-hidden rounded-3xl bg-overlay p-0">
              <div className="flex items-center gap-3 border-b border-separator px-5">
                <MagnifyingGlass size={20} className="text-muted" aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && visible[0]) choose(visible[0]);
                  }}
                  placeholder="Search pages and actions…"
                  aria-label="Search pages and actions"
                  className="h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-field-placeholder"
                />
                <Kbd className="text-[11px]">
                  <Kbd.Content>Esc</Kbd.Content>
                </Kbd>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-2">
                {visible.length ? (
                  visible.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => choose(item)}
                        className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-secondary"
                      >
                        <span className="grid size-10 place-items-center rounded-xl bg-default text-foreground">
                          <ItemIcon size={20} aria-hidden="true" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium text-foreground">{item.label}</span>
                          <span className="block text-xs text-muted">{item.description}</span>
                        </span>
                        <ArrowUpRight
                          size={16}
                          className="text-muted opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-10 text-center text-[13px] text-muted">Nothing matches that search.</p>
                )}
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
