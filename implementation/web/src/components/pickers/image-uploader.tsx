"use client";

// Product images: add, remove and choose the main one. Uploads go straight to the
// image host with a request the server signs; the first image is the main one.
//
//   <ImageUploader workspaceId value={urls} onChange={setUrls} />

import { ImageSquare, Plus, Star, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { uploadProductImage } from "@/lib/products";

const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function ImageUploader({
  workspaceId,
  value,
  onChange,
  label = "Product images",
  hint = "Recommended size 930 × 1163 px. JPG, PNG or WebP, up to 5 MB each. The first image is the main one.",
}: {
  workspaceId: number;
  value: string[];
  onChange: (urls: string[]) => void;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const room = MAX_IMAGES - value.length;
    const picked = Array.from(files).slice(0, room);
    const bad = picked.find((file) => !ACCEPTED.includes(file.type) || file.size > MAX_BYTES);
    if (bad) {
      setError(`${bad.name}: use a JPG, PNG or WebP image up to 5 MB.`);
      return;
    }
    setUploading(picked.length);
    const uploaded: string[] = [];
    for (const file of picked) {
      try {
        uploaded.push(await uploadProductImage(workspaceId, file));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "An image could not be uploaded.");
      }
      setUploading((count) => count - 1);
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    if (input.current) input.current.value = "";
  };

  const makeMain = (index: number) => onChange([value[index], ...value.filter((_, i) => i !== index)]);
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[13px] font-medium">
          {label} <span className="font-normal text-muted">(optional)</span>
        </p>
        <p className="text-[12px] text-muted">{hint}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, index) => (
          <figure key={url} className="animate-fade-up group relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-surface-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Product image ${index + 1}`} className="h-full w-full object-cover" />
            {index === 0 ? (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Main</span>
            ) : (
              <button
                type="button"
                aria-label="Make this the main image"
                onClick={() => makeMain(index)}
                className="absolute top-1.5 left-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <Star size={13} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove image ${index + 1}`}
              onClick={() => remove(index)}
              className="absolute top-1.5 right-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </figure>
        ))}
        {Array.from({ length: uploading }).map((_, index) => (
          <div key={`uploading-${index}`} className="aspect-[4/5] animate-pulse rounded-xl bg-default" />
        ))}
        {value.length + uploading < MAX_IMAGES ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            style={{ borderStyle: "dashed" }}
            className="field-shell flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1.5 text-center"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-surface-secondary text-muted">
              {value.length ? <Plus size={16} aria-hidden="true" /> : <ImageSquare size={18} aria-hidden="true" />}
            </span>
            <span className="text-[12px] font-medium text-muted">{value.length ? "Add more" : "Add images"}</span>
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple className="hidden" onChange={(event) => void add(event.target.files)} />
      {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
