"use client";

import { ListBox, Select } from "@heroui/react";
import { Buildings, SquaresFour, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";

import { useActiveWorkspace } from "@/stores/workspace-store";

const ALL_SPACES_KEY = "all";

interface WorkspaceOption {
  key: string;
  name: string;
  kind: string;
  icon: PhosphorIcon;
}

export function WorkspaceSwitcher() {
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
  const SelectedIcon = selected?.icon ?? Buildings;

  return (
    <Select
      aria-label="Workspace"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key === null || key === undefined) return;
        selectWorkspace(key === ALL_SPACES_KEY ? "all" : Number(key));
      }}
      className="w-full"
    >
      <Select.Trigger className="flex h-14 w-full cursor-pointer items-center gap-2.5 rounded-2xl border-0 bg-sidebar-hover px-3 text-left text-sidebar-foreground shadow-none outline-none">
        <Select.Value className="flex min-w-0 flex-1 items-center gap-2.5">
          {() => (
            <>
              <SelectedIcon size={20} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-sidebar-foreground">
                  {selected?.name ?? "Choose workspace"}
                </span>
                <span className="block truncate text-[11px] text-sidebar-label">{selected?.kind}</span>
              </span>
            </>
          )}
        </Select.Value>
        <Select.Indicator className="shrink-0 text-sidebar-foreground" />
      </Select.Trigger>
      <Select.Popover className="w-(--trigger-width) min-w-[220px] rounded-2xl border border-border bg-overlay p-1">
        <ListBox className="space-y-0.5 outline-none">
          {options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <ListBox.Item
                key={option.key}
                id={option.key}
                textValue={option.name}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 outline-none"
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
