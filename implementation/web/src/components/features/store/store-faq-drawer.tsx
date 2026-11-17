"use client";

import { ArrowLeft, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppTextarea } from "@/components/ui/app-textarea";
import { SideSheet } from "@/components/ui/side-sheet";

export type StoreFaqItem = { question: string; answer: string };
type EditingQuestion = { index: number | null; item: StoreFaqItem };
const emptyQuestion = (): EditingQuestion => ({ index: null, item: { question: "", answer: "" } });

export function StoreFaqDrawer({ items, onClose, onDone }: {
  items: StoreFaqItem[];
  onClose: () => void;
  onDone: (items: StoreFaqItem[]) => void;
}) {
  const formID = useId();
  const [questions, setQuestions] = useState(() => items.map((item) => ({ ...item })));
  const [editing, setEditing] = useState<EditingQuestion | null>(() => items.length ? null : emptyQuestion());
  const canApply = Boolean(editing?.item.question.trim() && editing.item.answer.trim())
    && (editing?.item.question.length ?? 0) <= 240 && (editing?.item.answer.length ?? 0) <= 1500;

  const applyQuestion = () => {
    if (!editing || !canApply || (editing.index === null && questions.length >= 10)) return;
    const item = { question: editing.item.question.trim(), answer: editing.item.answer.trim() };
    setQuestions((current) => editing.index === null ? [...current, item] : current.map((row, index) => index === editing.index ? item : row));
    setEditing(null);
  };

  return <SideSheet isOpen onClose={onClose} title={editing ? editing.index === null ? "Add question" : "Edit question" : "Frequently asked questions"} footer={editing ? <>
    <AppButton variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
    <AppButton type="submit" form={formID} label={editing.index === null ? "Add question" : "Save question"} isDisabled={!canApply} />
  </> : <>
    <AppButton variant="ghost" label="Cancel" onPress={onClose} />
    <AppButton label="Done" onPress={() => onDone(questions)} />
  </>}>
    {editing ? <form id={formID} onSubmit={(event) => { event.preventDefault(); applyQuestion(); }} className="space-y-4">
      <AppButton variant="ghost" size="sm" startContent={<ArrowLeft />} label="Back to FAQ" onPress={() => setEditing(null)} />
      <AppInput label="Question" isRequired maxLength={240} value={editing.item.question} onChange={(event) => setEditing((current) => current ? { ...current, item: { ...current.item, question: event.target.value } } : null)} />
      <AppTextarea label="Answer" isRequired rows={5} maxLength={1500} value={editing.item.answer} onChange={(event) => setEditing((current) => current ? { ...current, item: { ...current.item, answer: event.target.value } } : null)} />
    </form> : <div className="space-y-5">
      {questions.length ? <ul className="divide-y divide-separator border-y border-separator">
        {questions.map((item, index) => <li key={index} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.question}</p><p className="mt-1 line-clamp-2 text-[13px] text-muted">{item.answer}</p></div>
          <AppButton isIconOnly size="sm" variant="ghost" aria-label={`Edit ${item.question}`} startContent={<PencilSimple />} onPress={() => setEditing({ index, item: { ...item } })} />
          <AppButton isIconOnly size="sm" variant="ghost" aria-label={`Remove ${item.question}`} startContent={<Trash />} onPress={() => setQuestions((current) => current.filter((_, i) => i !== index))} />
        </li>)}
      </ul> : <p className="text-sm text-muted">No questions yet.</p>}
      <AppButton variant="secondary" startContent={<Plus />} label="Add question" isDisabled={questions.length >= 10} onPress={() => setEditing(emptyQuestion())} />
    </div>}
  </SideSheet>;
}
