"use client";

// A small rich text editor (Tiptap) for text shown on the public store, such as a
// product's long description. It gives back HTML; the API cleans it before saving.
//
//   <RichTextEditor label="Long description" value={html} onChange={setHtml} />

import { Dropdown } from "@heroui/react";
import {
  CaretUpDown,
  LinkSimple,
  LinkSimpleBreak,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useId, useState } from "react";

const BLOCKS = [
  { key: "p", label: "Normal" },
  { key: "h2", label: "Heading" },
  { key: "h3", label: "Subheading" },
] as const;

function ToolButton({ icon: Icon, label, active, onPress }: { icon: PhosphorIcon; label: string; active?: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors ${
        active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted hover:bg-surface-secondary hover:text-foreground"
      }`}
    >
      <Icon size={16} weight={active ? "bold" : "regular"} aria-hidden="true" />
    </button>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: current.isActive("heading", { level: 2 }) ? "h2" : current.isActive("heading", { level: 3 }) ? "h3" : "p",
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      quote: current.isActive("blockquote"),
      ordered: current.isActive("orderedList"),
      bullet: current.isActive("bulletList"),
      link: current.isActive("link"),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="scrollbar-none flex items-center gap-0.5 overflow-x-auto border-b border-separator px-2 py-1.5">
      <Dropdown>
        <Dropdown.Trigger className="inline-flex h-8 min-w-28 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 text-[13px] font-medium outline-none hover:bg-surface-secondary">
          {BLOCKS.find((block) => block.key === state.block)?.label}
          <CaretUpDown size={13} className="text-muted" aria-hidden="true" />
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-40 rounded-xl bg-overlay p-1">
          <Dropdown.Menu
            aria-label="Text style"
            onAction={(key) => {
              if (key === "p") chain().setParagraph().run();
              if (key === "h2") chain().toggleHeading({ level: 2 }).run();
              if (key === "h3") chain().toggleHeading({ level: 3 }).run();
            }}
          >
            {BLOCKS.map((block) => (
              <Dropdown.Item key={block.key} id={block.key} textValue={block.label} className={`rounded-lg px-3 py-2 ${block.key === "h2" ? "text-[16px] font-bold" : block.key === "h3" ? "text-[14px] font-semibold" : "text-[13px]"}`}>
                {block.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <span className="mx-1 h-5 w-px shrink-0 bg-separator" />
      <ToolButton icon={TextB} label="Bold" active={state.bold} onPress={() => chain().toggleBold().run()} />
      <ToolButton icon={TextItalic} label="Italic" active={state.italic} onPress={() => chain().toggleItalic().run()} />
      <ToolButton icon={TextUnderline} label="Underline" active={state.underline} onPress={() => chain().toggleUnderline().run()} />
      <ToolButton icon={TextStrikethrough} label="Strikethrough" active={state.strike} onPress={() => chain().toggleStrike().run()} />
      <ToolButton icon={Quotes} label="Quote" active={state.quote} onPress={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={Minus} label="Divider" onPress={() => chain().setHorizontalRule().run()} />
      <span className="mx-1 h-5 w-px shrink-0 bg-separator" />
      <ToolButton icon={ListNumbers} label="Numbered list" active={state.ordered} onPress={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={ListBullets} label="Bullet list" active={state.bullet} onPress={() => chain().toggleBulletList().run()} />
      <span className="mx-1 h-5 w-px shrink-0 bg-separator" />
      {state.link ? (
        <ToolButton icon={LinkSimpleBreak} label="Remove link" active onPress={() => chain().extendMarkRange("link").unsetLink().run()} />
      ) : (
        <ToolButton icon={LinkSimple} label="Add link" onPress={onLink} />
      )}
    </div>
  );
}

function normaliseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder = "Write something…",
  description,
}: {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  description?: string;
}) {
  const labelId = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        role: "textbox",
        class: "rich-text min-h-32 px-3.5 py-3 text-[14px] outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });

  const applyLink = () => {
    if (!editor) return;
    const url = normaliseUrl(linkValue);
    if (!url) return setLinkError("Enter a web address, like example.com");
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkValue("");
    setLinkError("");
  };

  return (
    <div className="space-y-1.5">
      {label ? (
        <p id={labelId} className="text-[13px] font-medium">
          {label}
        </p>
      ) : null}
      <div className="field-shell overflow-hidden !p-0">
        {editor ? (
          <Toolbar
            editor={editor}
            onLink={() => {
              setLinkValue(editor.getAttributes("link").href ?? "");
              setLinkOpen(true);
            }}
          />
        ) : (
          <div className="h-11 border-b border-separator" />
        )}
        {linkOpen ? (
          <div className="animate-fade-up flex items-center gap-2 border-b border-separator px-2.5 py-2">
            <input
              autoFocus
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
                setLinkError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") setLinkOpen(false);
              }}
              placeholder="Paste a link, like example.com"
              aria-label="Link address"
              className="h-8 min-w-0 flex-1 rounded-lg bg-surface-secondary px-2.5 text-[13px] outline-none"
            />
            <button type="button" onClick={applyLink} className="h-8 cursor-pointer rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground">
              Add link
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} className="h-8 cursor-pointer rounded-lg px-2.5 text-[12px] font-medium text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        ) : null}
        {linkError ? <p className="px-3.5 pt-2 text-[12px] font-medium text-danger">{linkError}</p> : null}
        <div className="relative">
          {!value ? <span className="pointer-events-none absolute top-3 left-3.5 text-[14px] text-field-placeholder">{placeholder}</span> : null}
          <EditorContent editor={editor} />
        </div>
      </div>
      {description ? <p className="text-[12px] text-muted">{description}</p> : null}
    </div>
  );
}

/** Shows saved rich text. The API has already cleaned the HTML; plain text from before keeps its line breaks. */
export function RichText({ html, className = "" }: { html: string; className?: string }) {
  if (!/<[a-z][\s\S]*>/i.test(html)) return <p className={`text-[14px] whitespace-pre-line ${className}`}>{html}</p>;
  return <div className={`rich-text text-[14px] ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
