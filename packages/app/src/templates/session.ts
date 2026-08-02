export type SessionTemplate = {
  id: string
  label: string
  description: string
  prompt: string
  stack: {
    framework: "react"
    bundler: "vite"
    language: "typescript"
    styling: "tailwind"
    cms: "trellis"
  }
}

const stack = {
  framework: "react",
  bundler: "vite",
  language: "typescript",
  styling: "tailwind",
  cms: "trellis",
} as const

const seed = (kind: string, detail: string) =>
  `Create a ${kind} using React, Vite, TypeScript, and Tailwind. Include Trellis CMS and the Trellis client SDK from the start, with schema-backed content collections, typed CMS helpers, and sample data wired into the UI. ${detail}`

export const sessionTemplates = [
  {
    id: "website",
    label: "Website",
    description: "Marketing site with CMS-backed pages and sections",
    stack,
    prompt: seed(
      "website",
      "Start with editable pages, navigation, hero content, feature sections, testimonials, and posts.",
    ),
  },
  {
    id: "app",
    label: "App",
    description: "Interactive product app with structured data",
    stack,
    prompt: seed("app", "Start with dashboard routes, settings, task-like records, activity, and reusable UI components."),
  },
  {
    id: "game",
    label: "Game",
    description: "Playable browser game with CMS-tuned content",
    stack,
    prompt: seed("game", "Start with levels, characters, items, score state, and CMS-editable game configuration."),
  },
  {
    id: "slides",
    label: "Slide Deck",
    description: "Presentation deck with editable slides",
    stack,
    prompt: seed("slide deck", "Start with decks, slides, speaker notes, themes, and keyboard navigation."),
  },
  {
    id: "video",
    label: "Video",
    description: "Video/script planning workspace",
    stack,
    prompt: seed("video workspace", "Start with scenes, scripts, assets, captions, shot lists, and preview-friendly layouts."),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Metrics dashboard with CMS-managed entities",
    stack,
    prompt: seed("dashboard", "Start with KPI cards, charts, entities, filters, and CMS-backed metric definitions."),
  },
  {
    id: "docs",
    label: "Docs",
    description: "Documentation site with structured articles",
    stack,
    prompt: seed("documentation site", "Start with docs pages, categories, search-friendly navigation, and markdown-style content."),
  },
  {
    id: "store",
    label: "Storefront",
    description: "Commerce storefront with editable catalog content",
    stack,
    prompt: seed("storefront", "Start with products, collections, pricing, cart UI, and CMS-backed merchandising content."),
  },
] satisfies SessionTemplate[]
