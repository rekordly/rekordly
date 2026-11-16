"use client";

// Messages on a document (a purchase order and its supplier, …).
//
//   <DocumentChat workspaceId={1} docType="purchase_order" docId={12} partyName="Dangote" senderName="Ade Stores" />
//
// A "Messages" button with an unread dot opens a side sheet: messages grouped by day
// with times, newest at the bottom, and a one-line composer pinned to the bottom
// (Enter sends, Shift+Enter adds a line). New replies are checked every 15 seconds
// while the sheet is open, and every minute otherwise.

import { ChatCircleDots, PaperPlaneRight } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@heroui/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AppTextarea } from "@/components/ui/app-textarea";
import { SideSheet } from "@/components/ui/side-sheet";
import { formatDate } from "@/lib/format";
import { financeApi, moneyKeys } from "@/lib/money";
import type { ExternalMessage } from "@/types/finance";

const seenKey = (docType: string, docId: number) => `rekordly:seen:${docType}:${docId}`;

function readSeen(docType: string, docId: number) {
  try {
    return Number(window.localStorage.getItem(seenKey(docType, docId)) || 0);
  } catch {
    return 0;
  }
}

function writeSeen(docType: string, docId: number, id: number) {
  try {
    window.localStorage.setItem(seenKey(docType, docId), String(id));
  } catch {
    /* private window: unread dots just stay */
  }
}

function dayLabel(value: string) {
  const day = value.slice(0, 10);
  const today = new Date();
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const local = iso(new Date(value));
  if (local === iso(today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (local === iso(yesterday)) return "Yesterday";
  return formatDate(day);
}

const timeOf = (value: string) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function DocumentChat({
  workspaceId,
  docType,
  docId,
  partyName,
  senderName,
  unreadCount,
}: {
  workspaceId: number;
  docType: string;
  docId: number;
  partyName: string;
  /** Shown to the other side, e.g. the business name. */
  senderName?: string;
  unreadCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => (typeof window === "undefined" ? 0 : readSeen(docType, docId)));
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const queryKey = [...moneyKeys.workspace(workspaceId), "document-messages", docType, docId];
  const messages = useQuery({
    queryKey,
    queryFn: () => financeApi.listTeamDocumentMessages(workspaceId, docType, docId),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const list: ExternalMessage[] = messages.data ?? [];
  const lastId = list.length ? Math.max(...list.map((message) => message.id)) : 0;
  const unread = open
    ? list.filter((message) => message.sender_type !== "team" && message.id > seen).length
    : (unreadCount ?? 0);

  // While open, everything shown counts as read, and the newest message stays in view.
  useEffect(() => {
    if (!open) return;
    if (lastId) writeSeen(docType, docId, lastId);
    endRef.current?.scrollIntoView({ block: "end" });
  }, [open, lastId, docType, docId]);

  const send = useMutation({
    mutationFn: (message: string) => financeApi.postTeamDocumentMessage(workspaceId, docType, docId, message, senderName),
    onSuccess: () => {
      setText("");
      void messages.refetch();
      inputRef.current?.focus();
    },
    onError: (error: Error) => toast.danger(error.message || "The message was not sent."),
  });

  const submit = () => {
    const message = text.trim();
    if (!message || send.isPending) return;
    send.mutate(message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const close = () => {
    setSeen(lastId);
    setOpen(false);
  };

  // Group by day for "Today" / "Yesterday" separators.
  const groups: { day: string; items: ExternalMessage[] }[] = [];
  for (const message of list) {
    const day = dayLabel(message.created_at);
    const group = groups[groups.length - 1];
    if (group && group.day === day) group.items.push(message);
    else groups.push({ day, items: [message] });
  }

  return (
    <>
      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
          title="Messages"
          onClick={() => setOpen(true)}
          className="grid size-10 cursor-pointer place-items-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-secondary"
        >
          <ChatCircleDots size={19} weight="duotone" aria-hidden="true" />
        </button>
        {unread ? (
          <span aria-hidden="true" className="pointer-events-none absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </span>

      <SideSheet
        isOpen={open}
        onClose={close}
        title="Messages"
        description={`With ${partyName}`}
        footer={
          <form
            className="flex w-full items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <AppTextarea
              ref={inputRef}
              aria-label={`Message ${partyName}`}
              placeholder="Write a message…"
              rows={1}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={onKeyDown}
              containerClassName="min-w-0 flex-1"
              className="max-h-[120px] min-h-11 resize-none! py-2.5"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim() || send.isPending}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PaperPlaneRight size={18} weight="fill" aria-hidden="true" />
            </button>
          </form>
        }
      >
        {messages.isPending ? (
          <div className="space-y-3">
            <div className="h-14 w-2/3 animate-pulse rounded-2xl bg-default" />
            <div className="ml-auto h-14 w-2/3 animate-pulse rounded-2xl bg-default" />
          </div>
        ) : !list.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-secondary text-muted">
              <ChatCircleDots size={22} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[14px] font-semibold">No messages yet</p>
            <p className="mt-0.5 text-[13px] text-muted">Ask {partyName} about delivery or prices.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.day} className="space-y-2">
                <p className="text-center text-[11px] font-semibold text-muted">{group.day}</p>
                {group.items.map((message) => {
                  const mine = message.sender_type === "team";
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-surface-secondary text-foreground"}`}>
                        {!mine ? <p className="mb-0.5 text-[11px] font-semibold text-muted">{message.sender_name}</p> : null}
                        <p className="break-words whitespace-pre-wrap">{message.message}</p>
                        <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted"}`}>{timeOf(message.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </SideSheet>
    </>
  );
}
