import type { BrandTemplateSpec, CloudBrandTemplate } from "./design-types"

const CORE_LUCIDE_ICONS = [
  "heart",
  "star",
  "home",
  "user",
  "settings",
  "search",
  "mail",
  "calendar",
  "check",
  "arrow-right",
  "menu",
  "image",
  "file",
  "folder",
  "link",
  "globe",
  "sun",
  "moon",
  "zap",
  "bell",
  "tag",
  "palette",
  "type",
  "sparkles",
  "info",
  "pencil",
] as const

export const BRAND_TEMPLATE_PRESETS: CloudBrandTemplate[] = [
  {
    id: "preset:neutral-product",
    name: "Neutral Product",
    description: "Clear, professional product UI with balanced neutrals and Inter typography.",
    version: 1,
    spec: {
      name: "Neutral Product",
      description: "Clear, professional product UI for builders and teams.",
      iconLibrary: "lucide",
      primaryPaletteName: "Neutral",
      headingFontFamily: "Inter",
      bodyFontFamily: "Inter",
      monoFontFamily: "JetBrains Mono",
      semantics: {
        tone: ["clear", "professional"],
        mood: ["focused"],
        audience: ["builders", "teams"],
      },
      palettes: [
        {
          name: "Neutral",
          description: "Balanced neutral palette for product UI",
          swatches: {
            primary: "#18181b",
            secondary: "#52525b",
            accent: "#2563eb",
            surface: "#fafafa",
            background: "#ffffff",
            border: "#e4e4e7",
            success: "#16a34a",
            warning: "#f59e0b",
            danger: "#dc2626",
          },
          tags: ["neutral", "default"],
        },
      ],
      fonts: [
        {
          family: "Inter",
          category: "sans-serif",
          variants: ["regular", "500", "600", "700"],
          catalogRef: "google-fonts:Inter",
        },
        {
          family: "JetBrains Mono",
          category: "monospace",
          variants: ["regular", "500", "700"],
          catalogRef: "google-fonts:JetBrains Mono",
        },
      ],
      icons: CORE_LUCIDE_ICONS.map((key) => ({ key, library: "lucide" as const })),
    },
  },
  {
    id: "preset:warm-studio",
    name: "Warm Studio",
    description: "Editorial warmth with serif accents and an orange-forward palette.",
    version: 1,
    spec: {
      name: "Warm Studio",
      description: "Warm editorial palette for creative and content-forward projects.",
      iconLibrary: "lucide",
      primaryPaletteName: "Warm Studio",
      headingFontFamily: "Lora",
      bodyFontFamily: "Open Sans",
      monoFontFamily: "JetBrains Mono",
      semantics: {
        tone: ["warm", "expressive"],
        mood: ["creative", "inviting"],
        audience: ["creators", "studios"],
        avoid: ["cold", "corporate"],
      },
      palettes: [
        {
          name: "Warm Studio",
          description: "Warm editorial palette for creative projects",
          swatches: {
            primary: "#7c2d12",
            secondary: "#a16207",
            accent: "#ea580c",
            surface: "#fff7ed",
            background: "#fffbeb",
            border: "#fed7aa",
            success: "#15803d",
            warning: "#ca8a04",
            danger: "#b91c1c",
          },
          tags: ["warm", "editorial"],
        },
      ],
      fonts: [
        {
          family: "Lora",
          category: "serif",
          variants: ["regular", "600", "700"],
          catalogRef: "google-fonts:Lora",
        },
        {
          family: "Open Sans",
          category: "sans-serif",
          variants: ["regular", "600", "700"],
          catalogRef: "google-fonts:Open Sans",
        },
        {
          family: "JetBrains Mono",
          category: "monospace",
          variants: ["regular", "500", "700"],
          catalogRef: "google-fonts:JetBrains Mono",
        },
      ],
      icons: CORE_LUCIDE_ICONS.map((key) => ({ key, library: "lucide" as const })),
    },
  },
]

export function findBrandTemplatePreset(id: string) {
  return BRAND_TEMPLATE_PRESETS.find((template) => template.id === id)
}

export function brandTemplateSpecFromPreset(id: string): BrandTemplateSpec | undefined {
  return findBrandTemplatePreset(id)?.spec
}
