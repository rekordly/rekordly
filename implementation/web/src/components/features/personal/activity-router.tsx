"use client";

import { useActiveWorkspace } from "@/stores/workspace-store";
import { TransactionList } from "../transaction-list";
import { PersonalActivityPage } from "./personal-activity";

export function ActivityRouter() {
  const { mode } = useActiveWorkspace();
  if (mode === "personal") {
    return <PersonalActivityPage />;
  }
  return <TransactionList />;
}
