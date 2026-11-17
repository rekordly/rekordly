"use client";

import { ColorArea, ColorPicker, ColorSlider, ColorSwatch } from "@heroui/react";
import { Plus, X } from "@phosphor-icons/react";
import { AppSelect } from "@/components/ui/app-select";
import { AppButton } from "@/components/ui/app-button";
import type { BrandSettings, FontStyleKey } from "@/lib/store-themes";

const fonts = [{ key: "modern", label: "Inter" }, { key: "classic", label: "Merriweather" }, { key: "friendly", label: "Plus Jakarta Sans" }];

export function StoreBrandFields({ brand, onChange }: { brand: BrandSettings; onChange: (brand: BrandSettings) => void }) {
  const colors = brand.colors ?? [];
  return <div className="space-y-5">
    <div><p className="text-sm font-medium">Brand colours</p><p className="mt-1 text-xs text-muted">Add up to three colours. Templates use the colours they support, with their own defaults for any you leave unset.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {colors.map((color, index) => <div key={index} className="flex items-center gap-1 rounded-xl border border-border p-1">
          <ColorPicker value={color} onChange={(value) => onChange({ ...brand, colors: colors.map((item, i) => i === index ? value.toString("hex") : item) })}>
            <ColorPicker.Trigger aria-label={`Choose ${["primary", "secondary", "tertiary"][index]} colour`} className="flex items-center gap-2 px-2 py-1"><ColorSwatch className="size-8 rounded-lg" /><span className="text-xs">{["Primary", "Secondary", "Tertiary"][index]}<span className="block text-muted">{color}</span></span></ColorPicker.Trigger>
            <ColorPicker.Popover className="space-y-3 p-4"><ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness"><ColorArea.Thumb /></ColorArea><ColorSlider channel="hue" colorSpace="hsb"><ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track></ColorSlider></ColorPicker.Popover>
          </ColorPicker>
          <AppButton size="sm" isIconOnly variant="ghost" aria-label={`Remove ${["primary", "secondary", "tertiary"][index]} colour`} startContent={<X />} onPress={() => onChange({ ...brand, colors: colors.filter((_, i) => i !== index) })} />
        </div>)}
        {colors.length < 3 ? <AppButton variant="secondary" size="sm" startContent={<Plus />} label={colors.length ? "Add colour" : "Add primary colour"} onPress={() => onChange({ ...brand, colors: [...colors, ["#29382e", "#c1a78a", "#eee8e0"][colors.length]] })} /> : null}
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2"><AppSelect label="Heading font" options={fonts} selectedKey={brand.heading_font ?? "modern"} onSelectionChange={(value) => onChange({ ...brand, heading_font: value as FontStyleKey })} /><AppSelect label="Body font" options={fonts} selectedKey={brand.body_font ?? "modern"} onSelectionChange={(value) => onChange({ ...brand, body_font: value as FontStyleKey })} /></div>
  </div>;
}
