"use client";

// Brand colours (up to three) and heading/body fonts. Every template reads these;
// a colour left unset uses the template's own default.

import { ColorArea, ColorPicker, ColorSlider, ColorSwatch } from "@heroui/react";
import { Plus, X } from "@phosphor-icons/react";

import { AppButton } from "@/components/ui/app-button";
import { AppComboBox } from "@/components/ui/app-combo-box";
import { BRAND_FONT_KEYS, FONT_STYLES, isBrandFont } from "@/lib/store-themes/font-styles";
import type { BrandFontKey, BrandSettings } from "@/lib/store-themes";

const COLOR_NAMES = ["Primary", "Secondary", "Tertiary"];
const STARTER_COLORS = ["#29382E", "#C1A78A", "#EEE8E0"];
const FONT_OPTIONS = BRAND_FONT_KEYS.map((key) => ({ key, label: FONT_STYLES[key].label, description: FONT_STYLES[key].group, labelStyle: { fontFamily: FONT_STYLES[key].headingFamily, fontSize: 15 } }));

function FontField({ label, value, onChange }: { label: string; value: BrandFontKey; onChange: (value: BrandFontKey) => void }) {
  return (
    <AppComboBox
      label={label}
      placeholder="Search fonts"
      allowsCustomValue={false}
      options={FONT_OPTIONS}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (isBrandFont(key)) onChange(key);
      }}
    />
  );
}

export function StoreBrandFields({ brand, onChange }: { brand: BrandSettings; onChange: (brand: BrandSettings) => void }) {
  const colors = brand.colors ?? [];
  const heading = isBrandFont(brand.heading_font) ? brand.heading_font : "modern";
  const body = isBrandFont(brand.body_font) ? brand.body_font : "modern";
  const setColors = (next: string[]) => onChange({ ...brand, colors: next });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium">Brand colours</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {colors.map((color, index) => (
            <div key={index} className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
              <ColorPicker value={color} onChange={(value) => setColors(colors.map((item, at) => (at === index ? value.toString("hex") : item)))}>
                <ColorPicker.Trigger aria-label={`Choose ${COLOR_NAMES[index].toLowerCase()} colour`} className="flex cursor-pointer items-center gap-2 px-1.5 py-1">
                  <ColorSwatch className="size-8 rounded-lg" />
                  <span className="text-left text-[12px] leading-tight font-medium">
                    {COLOR_NAMES[index]}
                    <span className="block font-normal text-muted uppercase tabular">{color}</span>
                  </span>
                </ColorPicker.Trigger>
                <ColorPicker.Popover className="space-y-3 p-4">
                  <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness">
                    <ColorArea.Thumb />
                  </ColorArea>
                  <ColorSlider channel="hue" colorSpace="hsb">
                    <ColorSlider.Track>
                      <ColorSlider.Thumb />
                    </ColorSlider.Track>
                  </ColorSlider>
                </ColorPicker.Popover>
              </ColorPicker>
              <AppButton size="sm" isIconOnly variant="ghost" aria-label={`Remove ${COLOR_NAMES[index].toLowerCase()} colour`} startContent={<X />} onPress={() => setColors(colors.filter((_, at) => at !== index))} />
            </div>
          ))}
          {colors.length < 3 ? (
            <button
              type="button"
              aria-label={`Add ${COLOR_NAMES[colors.length].toLowerCase()} colour`}
              title={`Add ${COLOR_NAMES[colors.length].toLowerCase()} colour`}
              onClick={() => setColors([...colors, STARTER_COLORS[colors.length]])}
              className="grid size-[50px] cursor-pointer place-items-center rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 text-primary transition-colors hover:bg-primary-soft"
            >
              <Plus size={18} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FontField label="Heading font" value={heading} onChange={(value) => onChange({ ...brand, heading_font: value })} />
        <FontField label="Body font" value={body} onChange={(value) => onChange({ ...brand, body_font: value })} />
      </div>

      <div className="rounded-2xl border border-border bg-surface-secondary/50 p-4" aria-label="Font preview">
        <p className="text-[22px] leading-tight font-semibold" style={{ fontFamily: FONT_STYLES[heading].headingFamily, color: colors[0] }}>
          Find something you’ll love
        </p>
        <p className="mt-1.5 text-[14px] leading-6 text-muted" style={{ fontFamily: FONT_STYLES[body].bodyFamily }}>
          Quality products, delivered to your door.
        </p>
      </div>
    </div>
  );
}
