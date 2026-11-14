"use client";

// Choose the outlets (shops, warehouses) a product is sold or stocked in.
// Choosing none means every outlet.
//
//   <OutletPicker workspaceId value={ids} onChange={setIds} />

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ChipMultiSelect } from "@/components/ui/form-kit";
import { financeApi, moneyKeys } from "@/lib/money";

export function useOutlets(workspaceId: number) {
  return useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "outlets"],
    queryFn: () => financeApi.listOutlets(workspaceId),
  });
}

export function OutletPicker({
  workspaceId,
  value,
  onChange,
  label = "Where is this sold?",
  description = "Leave all unselected to sell it in every outlet.",
}: {
  workspaceId: number;
  value: number[];
  onChange: (ids: number[]) => void;
  label?: string;
  description?: string;
}) {
  const outlets = useOutlets(workspaceId);
  const options = (outlets.data ?? [])
    .filter((outlet) => outlet.is_active !== false)
    .map((outlet) => ({ key: String(outlet.id), label: outlet.is_default ? `${outlet.name} (main)` : outlet.name }));

  return (
    <ChipMultiSelect
      label={label}
      description={description}
      options={options}
      value={value.map(String)}
      onChange={(keys) => onChange(keys.map(Number))}
      emptyText={
        outlets.isPending ? (
          "Loading outlets…"
        ) : (
          <>
            No outlets yet. Add your shops in{" "}
            <Link href="/inventory" className="font-semibold text-primary hover:underline">
              Inventory
            </Link>
            .
          </>
        )
      }
    />
  );
}
