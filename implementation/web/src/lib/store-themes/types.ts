import type { ComponentType, ReactNode } from "react";

export type ThemeKey = "simple" | "boutique" | "bold" | "market" | "studio";
export type PaletteKey = "green" | "ink" | "ocean" | "sunset" | "rose" | "earth" | "custom";
export type FontStyleKey = "modern" | "classic" | "friendly";
export type SectionType = "announcement" | "hero" | "product_grid" | "collections" | "about" | "faq" | "contact";
export type SectionSource = "new" | "best_sellers" | "featured" | "collection";

export interface ThemePalette {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
}

export interface BrandSettings {
  colors?: string[];
  heading_font?: FontStyleKey;
  body_font?: FontStyleKey;
  logo_url?: string;
  palette: PaletteKey;
  custom_color?: string;
  font_style: FontStyleKey;
}

export interface StoreSection<T extends SectionType = SectionType> {
  id: string;
  type: T;
  enabled: boolean;
  content: Record<string, unknown>;
}

export interface ThemeSettings {
  theme_key: ThemeKey;
  name: string;
  brand: BrandSettings;
  sections: StoreSection[];
}

export type ThemeSectionManifest = {
  fields: readonly string[];
  limits?: Readonly<Record<string, number>>;
  max_slides?: number;
};

export interface ThemeManifest {
  key: ThemeKey;
  name: string;
  description: string;
  bestFor: readonly string[];
  price: "free" | { minor: string } | "billing_catalog";
  palettes: readonly PaletteKey[];
  fontStyles: readonly FontStyleKey[];
  sections: Partial<Record<SectionType, ThemeSectionManifest>>;
  defaultSections: readonly SectionType[];
  Renderer: ComponentType<ThemeRendererProps>;
}

export interface ThemeProduct {
  id: number;
  product_id: number;
  title: string;
  description?: string | null;
  image_urls: string[];
  price_minor: string;
  currency: string;
  currency_exponent: number;
  variant_name: string;
  availability_state: string;
  is_featured: boolean;
  collection_id?: number | null;
}

export interface ThemeCollection {
  id: number;
  name: string;
  slug?: string;
  image_url?: string | null;
}

export interface ThemeStoreData {
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  business_hours?: Record<string, string>;
  products: ThemeProduct[];
  collections: ThemeCollection[];
}

export interface ThemeRendererProps {
  store: ThemeStoreData;
  brand: BrandSettings & { resolved_palette?: ThemePalette };
  sections: StoreSection[];
  preview?: boolean;
  onSectionClick?: (section: StoreSection) => void;
  renderProduct?: (product: ThemeProduct, variants?: ThemeProduct[]) => ReactNode;
  productTools?: ReactNode;
  headerAction?: ReactNode;
  selectCollection?: (slug: string) => void;
  page?: "home" | "shop" | "about" | "policies" | "privacy" | "returns" | "terms" | "delivery" | "cart" | "collection" | "product";
  collectionSlug?: string;
}

