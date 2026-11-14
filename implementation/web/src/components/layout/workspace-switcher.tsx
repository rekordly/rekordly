"use client";

import { ListBox, Select } from "@heroui/react";
import { Buildings, CaretUpDown, SquaresFour, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";

import { useActiveWorkspace } from "@/stores/workspace-store";

const ALL_SPACES_KEY = "all";

interface WorkspaceOption {
  key: string;
  name: string;
  kind: string;
  icon: PhosphorIcon;
}

function initialOf(name?: string) {
  return (name?.trim()[0] ?? "R").toUpperCase();
}

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, active, workspaces, canViewAll, selectWorkspace } = useActiveWorkspace();

  const options: WorkspaceOption[] = [
    ...workspaces.map((workspace) => ({
      key: String(workspace.id),
      name: workspace.name,
      kind: workspace.kind === "business" ? "Business" : "Personal",
      icon: workspace.kind === "business" ? Buildings : UserCircle,
    })),
    ...(canViewAll
      ? [{ key: ALL_SPACES_KEY, name: "All spaces", kind: "Owner summary", icon: SquaresFour }]
      : []),
  ];

  const selectedKey = mode === "all" ? ALL_SPACES_KEY : String(active?.id ?? "");
  const selected = options.find((option) => option.key === selectedKey);

  return (
    <Select
      aria-label="Workspace"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key === null || key === undefined) return;
        selectWorkspace(key === ALL_SPACES_KEY ? "all" : Number(key));
      }}
      className={compact ? "mx-auto w-fit" : "w-full"}
    >
      <Select.Trigger
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent text-left text-sidebar-foreground shadow-none outline-none transition-colors hover:bg-sidebar-hover ${
          compact ? "size-11 justify-center px-0" : "h-12 w-full px-1.5"
        }`}
      >
        <Select.Value className={`flex min-w-0 items-center gap-3 ${compact ? "" : "flex-1"}`}>
          {() => (
            <>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-hover text-[13px] font-bold text-sidebar-foreground">
                {initialOf(selected?.name)}
              </span>
              {!compact ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
                    {selected?.name ?? "Choose workspace"}
                  </span>
                  <span className="block truncate text-[11.5px] text-sidebar-label">{selected?.kind}</span>
                </span>
              ) : null}
            </>
          )}
        </Select.Value>
        {!compact ? <CaretUpDown size={16} weight="bold" className="shrink-0 text-sidebar-label" aria-hidden="true" /> : null}
      </Select.Trigger>
      <Select.Popover className="w-(--trigger-width) min-w-[220px] rounded-xl border border-border bg-overlay p-1">
        <ListBox className="space-y-0.5 outline-none">
          {options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <ListBox.Item
                key={option.key}
                id={option.key}
                textValue={option.name}
                className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 outline-none"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <OptionIcon size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{option.name}</span>
                    <span className="block truncate text-[11px] text-muted">{option.kind}</span>
                  </span>
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
