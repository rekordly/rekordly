"use client";

// FAQ editor: the list, then one question at a time in the same sheet
// (back arrow in the header), like the customer picker.

import { Question, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppTextarea } from "@/components/ui/app-textarea";
import { ListAddRow, ListItemRow, ListRowIconButton } from "@/components/ui/list-rows";
import { SideSheet } from "@/components/ui/side-sheet";

export type StoreFaqItem = { question: string; answer: string };
type Editing = { index: number | null; item: StoreFaqItem };
const MAX = 10;

export function StoreFaqDrawer({ items, onClose, onDone }: { items: StoreFaqItem[]; onClose: () => void; onDone: (items: StoreFaqItem[]) => void }) {
  const formID = useId();
  const [questions, setQuestions] = useState(() => items.map((item) => ({ ...item })));
  const [editing, setEditing] = useState<Editing | null>(() => (items.length ? null : { index: null, item: { question: "", answer: "" } }));
  const valid = Boolean(editing?.item.question.trim() && editing.item.answer.trim());

  const save = () => {
    if (!editing || !valid) return;
    const item = { question: editing.item.question.trim(), answer: editing.item.answer.trim() };
    setQuestions((current) => (editing.index === null ? [...current, item] : current.map((row, index) => (index === editing.index ? item : row))));
    setEditing(null);
  };
  const setField = (key: keyof StoreFaqItem, value: string) => setEditing((current) => (current ? { ...current, item: { ...current.item, [key]: value } } : null));

  if (editing) {
    return (
      <SideSheet
        isOpen
        onClose={onClose}
        onBack={questions.length ? () => setEditing(null) : undefined}
        title={editing.index === null ? "Add question" : "Edit question"}
        footer={
          <>
            <AppButton variant="ghost" label="Cancel" onPress={() => (questions.length ? setEditing(null) : onClose())} />
            <AppButton type="submit" form={formID} label="Save" isDisabled={!valid} />
          </>
        }
      >
        <form
          id={formID}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <AppInput label="Question" autoFocus isRequired maxLength={240} value={editing.item.question} onChange={(event) => setField("question", event.target.value)} />
          <AppTextarea label="Answer" isRequired rows={5} maxLength={1500} value={editing.item.answer} onChange={(event) => setField("answer", event.target.value)} />
        </form>
      </SideSheet>
    );
  }

  return (
    <SideSheet
      isOpen
      onClose={onClose}
      title="Questions"
      description={`${questions.length} of ${MAX}`}
      footer={
        <>
          <AppButton variant="ghost" label="Cancel" onPress={onClose} />
          <AppButton label="Done" onPress={() => onDone(questions)} />
        </>
      }
    >
      <div className="space-y-3">
        <ListAddRow label="Add question" isDisabled={questions.length >= MAX} onPress={() => setEditing({ index: null, item: { question: "", answer: "" } })} />
        {questions.length ? (
          <ul className="space-y-1">
            {questions.map((item, index) => (
              <ListItemRow
                key={`${index}-${item.question}`}
                tile={<Question size={18} weight="duotone" aria-hidden="true" />}
                title={item.question}
                description={item.answer}
                onPress={() => setEditing({ index, item: { ...item } })}
                trailing={<ListRowIconButton label={`Remove ${item.question}`} tone="danger" icon={<Trash size={16} aria-hidden="true" />} onPress={() => setQuestions((current) => current.filter((_, at) => at !== index))} />}
              />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">No questions yet.</p>
        )}
      </div>
    </SideSheet>
  );
}
