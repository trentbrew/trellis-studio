import { GENERATED_ICONS } from "./generated-icons"
import { LUCIDE_GLYPHS } from "./catalog/lucide-glyphs"
import { isCustomIconKey, resolveIconLibrary } from "./icon-resolve"
import { parseIconKey } from "./icon-key"

// Single source of truth for entity type → color + icon across the app.
// Consumed by the graph view, entity dialog, database panel, mentions, etc.
// Icons are Lucide (https://lucide.dev) — iconNode data is baked in so we can
// render the same glyph via a Solid component AND as raw SVG innerHTML (for D3).

export const ENTITY_COLORS: Record<string, string> = {
  // Status colors (used as fallback when a type has no dedicated color).
  backlog: "#8f8f8f",
  queue: "#38bdf8",
  in_progress: "#f59e0b",
  paused: "#bc8cff",
  closed: "#10b981",

  // Store entities — first-class facts in the causal store; surfaced in the
  // graph view, database panel, entity dialog, and mentions.
  issue: "#e879f9",
  agent: "#38bdf8",
  project: "#f472b6",
  memory: "#a78bfa",
  note: "#fbbf24",
  mcp: "#34d399",
  sprite: "#fb923c",
  workunit: "#60a5fa",
  cycle: "#22d3ee",
  epic: "#f43f5e",
  roadmap: "#a3e635",
  suggestion: "#fbbf24",

  // Generic user-created entities — default type for Cmd+Shift+E flow.
  thing: "#818cf8",

  // Filesystem projections — synthesized by the graph builder, not store facts.
  file: "#14b8a6",
  directory: "#eab308",
  whiteboard: "#c084fc",

  // Platform / VCS concepts — live in the engine (branches, op-log, decision
  // ledger) rather than the store. Surfaced in the Plan panel (MilestoneList,
  // BranchManager, DecisionList) and in op badges.
  milestone: "#3b82f6",
  decision: "#c084fc",
  branch: "#fde047",
  // Causal stream entries (opt-in in the graph view). Muted slate reads as
  // a neutral history dot so ops don't compete with domain entities.
  op: "#94a3b8",
}

// Lucide icon node format: [tag, attrs][].
type IconNode = Array<[string, Record<string, string | number>]>

// Each entry is lifted from `lucide-solid` source — kept here so the D3
// imperative renderer and the Solid components share the same data.
const ICON_NODES: Record<string, IconNode> = {
  project: [
    [
      "path",
      {
        d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
      },
    ],
    ["path", { d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" }],
    ["path", { d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" }],
  ],
  issue: [
    [
      "path",
      { d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" },
    ],
    ["path", { d: "M13 5v2" }],
    ["path", { d: "M13 17v2" }],
    ["path", { d: "M13 11v2" }],
  ],
  agent: [
    ["path", { d: "M12 8V4H8" }],
    ["rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }],
    ["path", { d: "M2 14h2" }],
    ["path", { d: "M20 14h2" }],
    ["path", { d: "M15 13v2" }],
    ["path", { d: "M9 13v2" }],
  ],
  memory: [
    ["path", { d: "M12 18V5" }],
    ["path", { d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" }],
    ["path", { d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" }],
    ["path", { d: "M17.997 5.125a4 4 0 0 1 2.526 5.77" }],
    ["path", { d: "M18 18a4 4 0 0 0 2-7.464" }],
    ["path", { d: "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" }],
    ["path", { d: "M6 18a4 4 0 0 1-2-7.464" }],
    ["path", { d: "M6.003 5.125a4 4 0 0 0-2.526 5.77" }],
  ],
  mcp: [
    ["path", { d: "M12 22v-5" }],
    ["path", { d: "M15 8V2" }],
    ["path", { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" }],
    ["path", { d: "M9 8V2" }],
  ],
  sprite: [
    [
      "path",
      {
        d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
      },
    ],
    ["path", { d: "M20 2v4" }],
    ["path", { d: "M22 4h-4" }],
    ["circle", { cx: "4", cy: "20", r: "2" }],
  ],
  workunit: [
    ["path", { d: "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" }],
    ["path", { d: "m9 11 3 3L22 4" }],
  ],
  cycle: [
    ["path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }],
    ["path", { d: "M21 3v5h-5" }],
  ],
  epic: [
    [
      "path",
      {
        d: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
      },
    ],
  ],
  roadmap: [
    [
      "path",
      {
        d: "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
      },
    ],
    ["path", { d: "M15 5.764v15" }],
    ["path", { d: "M9 3.236v15" }],
  ],
  suggestion: [
    [
      "path",
      { d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" },
    ],
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }],
  ],
  file: [
    [
      "path",
      {
        d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      },
    ],
    ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
  ],
  directory: [
    [
      "path",
      {
        d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      },
    ],
  ],
  whiteboard: [
    [
      "path",
      {
        d: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z",
      },
    ],
    [
      "path",
      {
        d: "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z",
      },
    ],
  ],
  milestone: [
    ["path", { d: "M12 13v8" }],
    ["path", { d: "M12 3v3" }],
    [
      "path",
      {
        d: "M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
      },
    ],
  ],
  decision: [
    ["path", { d: "M12 3v18" }],
    ["path", { d: "m19 8 3 8a5 5 0 0 1-6 0zV7" }],
    ["path", { d: "M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" }],
    ["path", { d: "m5 8 3 8a5 5 0 0 1-6 0zV7" }],
    ["path", { d: "M7 21h10" }],
  ],
  branch: [
    ["path", { d: "M15 6a9 9 0 0 0-9 9V3" }],
    ["circle", { cx: "18", cy: "6", r: "3" }],
    ["circle", { cx: "6", cy: "18", r: "3" }],
  ],
  op: [
    ["circle", { cx: "12", cy: "12", r: "3" }],
    ["line", { x1: "3", x2: "9", y1: "12", y2: "12" }],
    ["line", { x1: "15", x2: "21", y1: "12", y2: "12" }],
  ],
  thing: [
    [
      "path",
      {
        d: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z",
      },
    ],
    ["path", { d: "M9 12h6" }],
    ["path", { d: "M12 9v6" }],
  ],
  // fallback
  entity: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  star: [
    [
      "polygon",
      { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" },
    ],
  ],
  heart: [
    [
      "path",
      {
        d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
      },
    ],
  ],
  bookmark: [["path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }]],
  flag: [
    ["path", { d: "M4 15s1-1 4-1 5 2 8 2 4-1 7-1 4 1 7-1" }],
    ["line", { x1: "4", x2: "4", y1: "22", y2: "15" }],
  ],
  tag: [
    ["path", { d: "M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" }],
    ["path", { d: "M7 7h.01" }],
  ],
  check: [["polyline", { points: "20 6 9 17 4 12" }]],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  alert: [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  help: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
    ["path", { d: "M12 17h.01" }],
  ],
  settings: [
    [
      "path",
      {
        d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      },
    ],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  tool: [
    [
      "path",
      {
        d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
      },
    ],
  ],
  key: [
    ["path", { d: "m21 2-8.6 8.6a2 2 0 0 1-2.8 0l-5.3-5.3a2 2 0 0 1 0-2.8L7 2" }],
    ["circle", { cx: "7", cy: "7", r: "1" }],
  ],
  lock: [
    ["rect", { height: "11", rx: "2", width: "18", x: "3", y: "11" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
  ],
  unlock: [
    ["rect", { height: "11", rx: "2", width: "18", x: "3", y: "11" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }],
  ],
  shield: [["path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" }]],
  crown: [
    ["path", { d: "m2 4 3 12h14l3-12-6 7-4-8-4 8-6-7Z" }],
    ["path", { d: "M9 14h6" }],
  ],
  award: [
    ["circle", { cx: "12", cy: "8", r: "7" }],
    ["polyline", { points: "8.21 13.89 7 23 12 20 17 23 15.79 13.88" }],
  ],
  trophy: [
    ["path", { d: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6" }],
    ["path", { d: "M18 9h1.5a2.5 2.5 0 0 0 0-5H18" }],
    ["path", { d: "M4 22h16" }],
    ["path", { d: "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" }],
    ["path", { d: "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" }],
  ],
  gem: [
    ["path", { d: "M6 3h12l4 6-10 13L2 9Z" }],
    ["path", { d: "M11 3 8 9l10 13" }],
    ["path", { d: "M13 3l3 6-10 13" }],
    ["path", { d: "M2 9h20" }],
  ],
  sparkles: [
    [
      "path",
      {
        d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z",
      },
    ],
    ["path", { d: "M5 3v4" }],
    ["path", { d: "M3 5h4" }],
    ["path", { d: "M19 17v4" }],
    ["path", { d: "M17 19h4" }],
  ],
  zap: [["polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2" }]],
  sun: [
    ["circle", { cx: "12", cy: "12", r: "4" }],
    ["path", { d: "M12 2v2" }],
    ["path", { d: "M12 20v2" }],
    ["path", { d: "m4.93 4.93 1.41 1.41" }],
    ["path", { d: "m17.66 17.66 1.41 1.41" }],
    ["path", { d: "M2 12h2" }],
    ["path", { d: "M20 12h2" }],
    ["path", { d: "m6.34 17.66-1.41 1.41" }],
    ["path", { d: "m19.07 4.93-1.41 1.41" }],
  ],
  moon: [["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]],
  cloud: [["path", { d: "M17.5 19c0-1.7-1.3-3-3-3h-11a4 4 0 0 1 0-8h1a5 5 0 0 1 9.9-1 3 3 0 0 1 3.1 12Z" }]],
  flame: [
    [
      "path",
      {
        d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38.5-2 1-3a1.5 1.5 0 0 0 .5 2.5A2.5 2.5 0 0 0 14 11c0-1.38-.5-2-1-3a1.5 1.5 0 0 0-.5 2.5A2.5 2.5 0 0 0 16.5 7c0-1.38-.5-2-1-3a1.5 1.5 0 0 0-.5 2.5A2.5 2.5 0 0 0 19 4c0-1.38-.5-2-1-3a1.5 1.5 0 0 0-.5 2.5",
      },
    ],
    [
      "path",
      {
        d: "M12 22c4.62 0 8.18-4.02 8.68-8.13a4.68 4.68 0 0 1-3.18-4.87c.58-6.27-6-10-6-10s-6.58 3.73-6 10a4.68 4.68 0 0 1-3.18 4.87c.5 4.11 4.06 8.13 8.68 8.13z",
      },
    ],
  ],
  mail: [
    ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }],
    ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }],
  ],
  user: [
    ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "12", cy: "7", r: "4" }],
  ],
  users: [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "9", cy: "7", r: "4" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
    ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  externalLink: [
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
    ["polyline", { points: "15 3 22 3 22 9" }],
    ["line", { x1: "10", x2: "22", y1: "14", y2: "3" }],
  ],
  eye: [
    ["path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  eyeOff: [
    ["path", { d: "M9.88 9.88 2 12s3-7 10-7a9.05 9.05 0 0 1 4.7 1.3" }],
    ["path", { d: "M2 2l20 20" }],
    ["path", { d: "m15.45 15.45-4.59-4.59" }],
    ["path", { d: "M21.12 11.22A12.01 12.01 0 0 1 22 12s-3 7-10 7a9.22 9.05 0 0 1-3.23-.55" }],
  ],
  clock: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["polyline", { points: "12 6 12 12 16 14" }],
  ],
  calendar: [
    ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }],
    ["line", { x1: "16", x2: "16", y1: "2", y2: "6" }],
    ["line", { x1: "8", x2: "8", y1: "2", y2: "6" }],
    ["line", { x1: "3", x2: "21", y1: "10", y2: "10" }],
  ],
  camera: [
    ["path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }],
    ["circle", { cx: "12", cy: "13", r: "3" }],
  ],
  video: [
    ["path", { d: "m22 8-6 4 6 4V8Z" }],
    ["rect", { width: "14", height: "12", x: "2", y: "6", rx: "2" }],
  ],
  music: [
    ["path", { d: "M9 18V5l12-2v13" }],
    ["circle", { cx: "6", cy: "18", r: "3" }],
    ["circle", { cx: "18", cy: "16", r: "3" }],
  ],
  phone: [
    [
      "path",
      {
        d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
      },
    ],
  ],
  mic: [
    ["path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }],
    ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }],
    ["line", { x1: "12", x2: "12", y1: "19", y2: "22" }],
  ],
  volume2: [
    ["polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }],
    ["path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }],
    ["path", { d: "M15.54 8.46a5 5 0 0 1 0 7.08" }],
  ],
  search: [
    ["circle", { cx: "11", cy: "11", r: "8" }],
    ["path", { d: "m21 21-4.3-4.3" }],
  ],
  home: [
    ["path", { d: "m3 9 9-7 9 9v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }],
    ["polyline", { points: "9 22 9 12 15 12 15 22" }],
  ],
  briefcase: [
    ["rect", { width: "20", height: "14", x: "2", y: "7", rx: "2" }],
    ["path", { d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" }],
  ],
  coffee: [
    ["path", { d: "M17 8h1a4 4 0 1 1 0 8h-1" }],
    ["path", { d: "M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" }],
    ["line", { x1: "6", x2: "6", y1: "2", y2: "4" }],
    ["line", { x1: "10", x2: "10", y1: "2", y2: "4" }],
    ["line", { x1: "14", x2: "14", y1: "2", y2: "4" }],
  ],
  database: [
    ["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }],
    ["path", { d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" }],
    ["path", { d: "M3 12c0 1.66 4 3 9 3s9-1.34 9-3" }],
  ],
  code: [
    ["polyline", { points: "16 18 22 12 16 6" }],
    ["polyline", { points: "8 6 2 12 8 18" }],
  ],
  terminal: [
    ["polyline", { points: "4 17 10 11 4 5" }],
    ["line", { x1: "12", x2: "20", y1: "19", y2: "19" }],
  ],
  command: [
    [
      "path",
      {
        d: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z",
      },
    ],
  ],
  cpu: [
    ["rect", { width: "16", height: "16", x: "4", y: "4", rx: "2" }],
    ["rect", { width: "6", height: "6", x: "9", y: "9", rx: "1" }],
    ["path", { d: "M15 2v2" }],
    ["path", { d: "M15 20v2" }],
    ["path", { d: "M2 15h2" }],
    ["path", { d: "M20 15h2" }],
    ["path", { d: "M2 9h2" }],
    ["path", { d: "M20 9h2" }],
    ["path", { d: "M9 2v2" }],
    ["path", { d: "M9 20v2" }],
  ],
  server: [
    ["rect", { width: "20", height: "8", x: "2", y: "3", rx: "2" }],
    ["rect", { width: "20", height: "8", x: "2", y: "13", rx: "2" }],
    ["line", { x1: "6", x2: "6", y1: "7", y2: "7" }],
    ["line", { x1: "6", x2: "6", y1: "17", y2: "17" }],
  ],
  activity: [["polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }]],
  trendingUp: [
    ["polyline", { points: "23 6 13.5 15.5 8.5 10.5 1 18" }],
    ["polyline", { points: "17 6 23 6 23 12" }],
  ],
  trendingDown: [
    ["polyline", { points: "23 18 13.5 8.5 8.5 13.5 1 6" }],
    ["polyline", { points: "17 18 23 18 23 12" }],
  ],
  archive: [
    ["rect", { width: "20", height: "5", x: "2", y: "3", rx: "1" }],
    ["path", { d: "M4 8v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8" }],
    ["line", { x1: "10", x2: "14", y1: "12", y2: "12" }],
  ],
  bell: [
    ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }],
    ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" }],
  ],
  book: [
    ["path", { d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" }],
    ["path", { d: "M6.5 18H20" }],
  ],
  brain: [
    [
      "path",
      {
        d: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z",
      },
    ],
    [
      "path",
      {
        d: "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z",
      },
    ],
  ],
  clipboard: [
    ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1" }],
    ["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }],
  ],
  compass: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["polygon", { points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" }],
  ],
  creditCard: [
    ["rect", { width: "20", height: "14", x: "2", y: "5", rx: "2" }],
    ["line", { x1: "2", x2: "22", y1: "10", y2: "10" }],
  ],
  globe: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["line", { x1: "2", x2: "22", y1: "12", y2: "12" }],
    ["path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" }],
  ],
  image: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    ["circle", { cx: "8.5", cy: "8.5", r: "1.5" }],
    ["polyline", { points: "21 15 16 10 5 21" }],
  ],
  inbox: [
    ["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12" }],
    [
      "path",
      {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      },
    ],
  ],
  layers: [
    ["polygon", { points: "12 2 2 7 12 12 22 7 12 2" }],
    ["polyline", { points: "2 17 12 22 22 17" }],
    ["polyline", { points: "2 12 12 17 22 12" }],
  ],
  layout: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    ["line", { x1: "3", x2: "21", y1: "9", y2: "9" }],
    ["line", { x1: "9", x2: "9", y1: "21", y2: "9" }],
  ],
  map: [
    ["polygon", { points: "1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" }],
    ["line", { x1: "8", x2: "8", y1: "2", y2: "18" }],
    ["line", { x1: "16", x2: "16", y1: "6", y2: "22" }],
  ],
  messageSquare: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
  monitor: [
    ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }],
    ["line", { x1: "8", x2: "16", y1: "21", y2: "21" }],
    ["line", { x1: "12", x2: "12", y1: "17", y2: "21" }],
  ],
  package: [
    ["path", { d: "M16.5 9.4 7.5 4.21" }],
    [
      "path",
      {
        d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
      },
    ],
    ["polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }],
    ["line", { x1: "12", x2: "12", y1: "22.08", y2: "12" }],
  ],
  paperclip: [
    [
      "path",
      {
        d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
      },
    ],
  ],
  pieChart: [
    ["path", { d: "M21.21 15.89A10 10 0 1 1 8 2.83" }],
    ["path", { d: "M22 12A10 10 0 0 0 12 2v10z" }],
  ],
  rocket: [
    ["path", { d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" }],
    ["path", { d: "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" }],
    ["path", { d: "M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3" }],
    ["path", { d: "M15 21s-3.03-.55-5-2c-2.2-1.62-3-5-3-5h5" }],
  ],
  shoppingCart: [
    ["circle", { cx: "9", cy: "21", r: "1" }],
    ["circle", { cx: "20", cy: "21", r: "1" }],
    ["path", { d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" }],
  ],
  smile: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M8 14s1.5 2 4 2 4-2 4-2" }],
    ["line", { x1: "9", x2: "9.01", y1: "9", y2: "9" }],
    ["line", { x1: "15", x2: "15.01", y1: "9", y2: "9" }],
  ],
  tablet: [
    ["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", ry: "2" }],
    ["line", { x1: "12", x2: "12", y1: "18", y2: "18" }],
  ],
  thumbsUp: [
    ["path", { d: "M7 10v12" }],
    [
      "path",
      {
        d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z",
      },
    ],
  ],
  thumbsDown: [
    ["path", { d: "M17 14V2" }],
    [
      "path",
      {
        d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z",
      },
    ],
  ],
  anchor: [
    ["circle", { cx: "12", cy: "5", r: "3" }],
    ["line", { x1: "12", x2: "12", y1: "8", y2: "22" }],
    ["path", { d: "M5 12H2a10 10 0 0 0 20 0h-3" }],
  ],
  aperture: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["line", { x1: "14.31", x2: "20.05", y1: "8", y2: "17.94" }],
    ["line", { x1: "9.69", x2: "21.17", y1: "8", y2: "8" }],
    ["line", { x1: "7.38", x2: "13.12", y1: "12", y2: "2.06" }],
    ["line", { x1: "9.69", x2: "3.95", y1: "16", y2: "6.06" }],
    ["line", { x1: "14.31", x2: "2.83", y1: "16", y2: "16" }],
    ["line", { x1: "16.62", x2: "10.88", y1: "12", y2: "21.94" }],
  ],
  battery: [
    ["rect", { width: "16", height: "10", x: "2", y: "7", rx: "2" }],
    ["line", { x1: "22", x2: "22", y1: "11", y2: "13" }],
  ],
  bluetooth: [["polyline", { points: "6.5 6.5 17.5 17.5 12 22.5 12 1.5 17.5 6.5 6.5 17.5" }]],
  cast: [
    ["path", { d: "M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" }],
    ["path", { d: "M2 12a9 9 0 0 1 8 8" }],
    ["path", { d: "M2 16a5 5 0 0 1 4 4" }],
    ["line", { x1: "2", x2: "2.01", y1: "20", y2: "20" }],
  ],
  dollarSign: [
    ["line", { x1: "12", x2: "12", y1: "1", y2: "23" }],
    ["path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" }],
  ],
  feather: [
    ["path", { d: "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" }],
    ["line", { x1: "16", x2: "2", y1: "8", y2: "22" }],
    ["line", { x1: "17.5", x2: "15", y1: "15", y2: "17.5" }],
  ],
  filter: [["polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }]],
  gift: [
    ["polyline", { points: "20 12 20 22 4 22 4 12" }],
    ["rect", { width: "20", height: "5", x: "2", y: "7" }],
    ["line", { x1: "12", x2: "12", y1: "22", y2: "7" }],
    ["path", { d: "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" }],
    ["path", { d: "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" }],
  ],
  hardDrive: [
    ["line", { x1: "22", x2: "2", y1: "12", y2: "12" }],
    [
      "path",
      {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      },
    ],
    ["line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }],
    ["line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }],
  ],
  hash: [
    ["line", { x1: "4", x2: "20", y1: "9", y2: "9" }],
    ["line", { x1: "4", x2: "20", y1: "15", y2: "15" }],
    ["line", { x1: "10", x2: "8", y1: "3", y2: "21" }],
    ["line", { x1: "16", x2: "14", y1: "3", y2: "21" }],
  ],
  headphones: [
    ["path", { d: "M3 18v-6a9 9 0 0 1 18 0v6" }],
    ["path", { d: "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" }],
    ["path", { d: "M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" }],
  ],
  infinity: [
    [
      "path",
      { d: "M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" },
    ],
  ],
  laptop: [
    ["rect", { width: "16", height: "11", x: "4", y: "5", rx: "2" }],
    ["line", { x1: "2", x2: "22", y1: "20", y2: "20" }],
  ],
  lifeBuoy: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["circle", { cx: "12", cy: "12", r: "4" }],
    ["line", { x1: "4.93", x2: "9.17", y1: "4.93", y2: "9.17" }],
    ["line", { x1: "14.83", x2: "19.07", y1: "14.83", y2: "19.07" }],
    ["line", { x1: "14.83", x2: "19.07", y1: "9.17", y2: "4.93" }],
    ["line", { x1: "4.93", x2: "9.17", y1: "19.07", y2: "14.83" }],
  ],
  loader: [
    ["line", { x1: "12", x2: "12", y1: "2", y2: "6" }],
    ["line", { x1: "12", x2: "12", y1: "18", y2: "22" }],
    ["line", { x1: "4.93", x2: "7.76", y1: "4.93", y2: "7.76" }],
    ["line", { x1: "16.24", x2: "19.07", y1: "16.24", y2: "19.07" }],
    ["line", { x1: "2", x2: "6", y1: "12", y2: "12" }],
    ["line", { x1: "18", x2: "22", y1: "12", y2: "12" }],
    ["line", { x1: "4.93", x2: "7.76", y1: "19.07", y2: "16.24" }],
    ["line", { x1: "16.24", x2: "19.07", y1: "7.76", y2: "4.93" }],
  ],
  mapPin: [
    ["path", { d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" }],
    ["circle", { cx: "12", cy: "10", r: "3" }],
  ],
  menu: [
    ["line", { x1: "3", x2: "21", y1: "12", y2: "12" }],
    ["line", { x1: "3", x2: "21", y1: "6", y2: "6" }],
    ["line", { x1: "3", x2: "21", y1: "18", y2: "18" }],
  ],
  mousePointer: [
    ["path", { d: "m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" }],
    ["path", { d: "m13 13 6 6" }],
  ],
  move: [
    ["polyline", { points: "5 9 2 12 5 15" }],
    ["polyline", { points: "9 5 12 2 15 5" }],
    ["polyline", { points: "15 19 12 22 9 19" }],
    ["polyline", { points: "19 9 22 12 19 15" }],
    ["line", { x1: "2", x2: "22", y1: "12", y2: "12" }],
    ["line", { x1: "12", x2: "12", y1: "2", y2: "22" }],
  ],
  navigation: [["polygon", { points: "3 11 22 2 13 21 11 13 3 11" }]],
  octagon: [["polygon", { points: "7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" }]],
  percent: [
    ["line", { x1: "19", x2: "5", y1: "5", y2: "19" }],
    ["circle", { cx: "6.5", cy: "6.5", r: "2.5" }],
    ["circle", { cx: "17.5", cy: "17.5", r: "2.5" }],
  ],
  power: [
    ["path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }],
    ["line", { x1: "12", x2: "12", y1: "2", y2: "12" }],
  ],
  radio: [
    ["circle", { cx: "12", cy: "12", r: "2" }],
    ["path", { d: "M16.24 7.76a6 6 0 0 1 0 8.48" }],
    ["path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }],
    ["path", { d: "M7.76 16.24a6 6 0 0 1 0-8.48" }],
    ["path", { d: "M4.93 19.07a10 10 0 0 1 0-14.14" }],
  ],
  scissors: [
    ["circle", { cx: "6", cy: "6", r: "3" }],
    ["circle", { cx: "6", cy: "18", r: "3" }],
    ["line", { x1: "20", x2: "8.12", y1: "4", y2: "15.88" }],
    ["line", { x1: "14.47", x2: "20", y1: "14.48", y2: "20" }],
    ["line", { x1: "8.12", x2: "12.06", y1: "8.12", y2: "12.06" }],
  ],
  share: [
    ["path", { d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" }],
    ["polyline", { points: "16 6 12 2 8 6" }],
    ["line", { x1: "12", x2: "12", y1: "2", y2: "15" }],
  ],
  shuffle: [
    ["polyline", { points: "16 3 21 3 21 8" }],
    ["line", { x1: "4", x2: "21", y1: "20", y2: "3" }],
    ["polyline", { points: "21 16 21 21 16 21" }],
    ["line", { x1: "15", x2: "21", y1: "15", y2: "21" }],
    ["line", { x1: "4", x2: "9", y1: "4", y2: "9" }],
  ],
  smartphone: [
    ["rect", { width: "10", height: "18", x: "7", y: "3", rx: "2", ry: "2" }],
    ["line", { x1: "12", x2: "12", y1: "18", y2: "18" }],
  ],
  speaker: [
    ["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", ry: "2" }],
    ["circle", { cx: "12", cy: "14", r: "4" }],
    ["line", { x1: "12", x2: "12", y1: "6", y2: "6" }],
  ],
  target: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["circle", { cx: "12", cy: "12", r: "6" }],
    ["circle", { cx: "12", cy: "12", r: "2" }],
  ],
  thermometer: [["path", { d: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" }]],
  truck: [
    ["rect", { width: "15", height: "13", x: "1", y: "3" }],
    ["polygon", { points: "16 8 20 8 23 11 23 16 16 16 16 8" }],
    ["circle", { cx: "5.5", cy: "18.5", r: "2.5" }],
    ["circle", { cx: "18.5", cy: "18.5", r: "2.5" }],
  ],
  tv: [
    ["rect", { width: "20", height: "15", x: "2", y: "7", rx: "2", ry: "2" }],
    ["polyline", { points: "17 2 12 7 7 2" }],
  ],
  umbrella: [["path", { d: "M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" }]],
  watch: [
    ["circle", { cx: "12", cy: "12", r: "7" }],
    ["polyline", { points: "12 9 12 12 13.5 13.5" }],
    [
      "path",
      {
        d: "M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.84a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.84 1H14.16a2 2 0 0 1 2 1.82l.35 3.83",
      },
    ],
  ],
  wifi: [
    ["path", { d: "M5 12.55a11 11 0 0 1 14.08 0" }],
    ["path", { d: "M1.42 9a16 16 0 0 1 21.16 0" }],
    ["path", { d: "M8.53 16.11a6 6 0 0 1 6.95 0" }],
    ["line", { x1: "12", x2: "12.01", y1: "20", y2: "20" }],
  ],
  wind: [
    ["path", { d: "M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" }],
  ],
}

function nodeToSvgInner(node: IconNode): string {
  return node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ")
      return `<${tag} ${a} />`
    })
    .join("")
}

// SVG inner markup (viewBox 0 0 24 24) for each entity type. Outer <svg>
// supplies the shared presentation attributes (stroke, linecap, etc.).
export const ENTITY_ICONS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ICON_NODES).map(([k, v]) => [k, nodeToSvgInner(v)])),
  ...GENERATED_ICONS,
}

// viewBox shared by all icon glyphs (lucide standard).
export const ENTITY_ICON_VIEWBOX = "0 0 24 24"
export const ENTITY_ICON_KEYS = Object.keys(ENTITY_ICONS).filter((key) => key !== "entity")

export type IconRenderStyle = "parent-stroke" | "self-stroke" | "fill"

export function iconRenderStyle(icon?: string): IconRenderStyle {
  if (!icon) return "parent-stroke"
  if (resolveIconLibrary(icon) === "custom" || isCustomIconKey(icon)) return "fill"
  const parsed = parseIconKey(icon)
  if (parsed && LUCIDE_GLYPHS[parsed.key]) return "self-stroke"
  return "parent-stroke"
}

export function entityIconGlyph(icon?: string): string | null {
  if (!icon) return null
  const parsed = parseIconKey(icon)
  if (!parsed) return null

  if (parsed.library === "custom" || isCustomIconKey(icon)) {
    return GENERATED_ICONS[parsed.key] ?? null
  }

  if (parsed.library === "brand") {
    return null
  }

  return LUCIDE_GLYPHS[parsed.key] ?? ENTITY_ICONS[parsed.key] ?? null
}

export type EntityTheme = {
  label: string
  color: string
  icon: string
  description?: string
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  issue: "Issue",
  agent: "Agent",
  project: "Project",
  memory: "Memory",
  note: "Note",
  mcp: "MCP",
  sprite: "Sprite",
  workunit: "WorkUnit",
  cycle: "Cycle",
  epic: "Epic",
  roadmap: "Roadmap",
  suggestion: "Suggestion",
  file: "File",
  directory: "Directory",
  whiteboard: "Whiteboard",
  op: "Op",
  branch: "Branch",
  decision: "Decision",
  milestone: "Milestone",
  session: "Session",
  typeschema: "TypeSchema",
  phase: "Phase",
  risk: "Risk",
  mitigationstrategy: "MitigationStrategy",
  checkpoint: "Checkpoint",
  acceptancecriteria: "AcceptanceCriteria",
  thing: "Thing",
}

const COMPOUND_TYPE_LABELS: Record<string, string> = {
  agentlane: "AgentLane",
}

function normalizeTypeKey(type: string) {
  return type.trim().toLowerCase()
}

function toPascalCase(raw: string) {
  return raw
    .replace(/[_\s-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/** Human-facing entity type name (PascalCase). Keys stay lowercase in storage/graph. */
export function entityTypeLabel(type: string, override?: string | null) {
  const key = normalizeTypeKey(type)
  if (COMPOUND_TYPE_LABELS[key]) return COMPOUND_TYPE_LABELS[key]
  const explicit = override?.trim()
  if (explicit) {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(explicit)) return explicit
    return toPascalCase(explicit)
  }
  if (SYSTEM_TYPE_LABELS[key]) return SYSTEM_TYPE_LABELS[key]
  return toPascalCase(key)
}

// Status colors that may be layered on top of type colors.
const STATUS_KEYS = new Set(["backlog", "queue", "in_progress", "paused", "closed"])
const CUSTOM_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#22d3ee",
  "#a3e635",
  "#fbbf24",
  "#60a5fa",
  "#34d399",
  "#c084fc",
]

function hash(raw: string): number {
  return Array.from(raw).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0)
}

export function defaultEntityColor(type: string | undefined): string {
  if (!type) return ENTITY_COLORS.backlog
  return CUSTOM_COLORS[hash(type) % CUSTOM_COLORS.length]
}

export function defaultEntityIcon(type: string | undefined): string {
  const key = type?.toLowerCase() ?? ""
  if (/phase|cycle|sprint/.test(key)) return "cycle"
  if (/risk|bug|issue|error|warning/.test(key)) return "issue"
  if (/strategy|task|criteria|criterion|work/.test(key)) return "workunit"
  if (/road|plan|map/.test(key)) return "roadmap"
  if (/memory|note|doc|knowledge/.test(key)) return "memory"
  if (/decision|choice|policy/.test(key)) return "decision"
  if (/checkpoint|milestone|goal/.test(key)) return "milestone"
  if (/project|org|workspace/.test(key)) return "project"
  if (/whiteboard|sketch|canvas|diagram/.test(key)) return "whiteboard"
  return ENTITY_ICON_KEYS[hash(key || "entity") % ENTITY_ICON_KEYS.length] ?? "thing"
}

// Resolve a color for an entity. Type wins; status is used as fallback only
// when the type is unknown (preserves legacy graph fallback behavior).
export function entityColor(type: string | undefined, status?: string | null, color?: string): string {
  if (color) return color
  if (type && ENTITY_COLORS[type]) return ENTITY_COLORS[type]
  if (type) return defaultEntityColor(type)
  if (status && ENTITY_COLORS[status]) return ENTITY_COLORS[status]
  return ENTITY_COLORS.backlog
}

export function entityIcon(type: string | undefined, icon?: string): string {
  if (icon) {
    const glyph = entityIconGlyph(icon)
    if (glyph) return glyph
  }
  if (type && ENTITY_ICONS[type]) return ENTITY_ICONS[type]
  return ENTITY_ICONS[defaultEntityIcon(type)] ?? ENTITY_ICONS.entity
}

// Derive an entity type from an id like "issue:TRL-12" or "dir:src/foo".
export function entityTypeFromId(id: string, fallback = "entity"): string {
  if (!id) return fallback
  const prefix = id.includes(":") ? id.split(":")[0] : fallback
  if (prefix === "dir") return "directory"
  return prefix || fallback
}

export function isStatusKey(k: string): boolean {
  return STATUS_KEYS.has(k)
}

// Solid component rendering the Lucide glyph for a given type.
export function EntityIcon(props: {
  type: string | undefined
  size?: number
  class?: string
  color?: string
  icon?: string
}) {
  const size = () => props.size ?? 14
  const style = () => iconRenderStyle(props.icon)
  return (
    <svg
      viewBox={ENTITY_ICON_VIEWBOX}
      width={size()}
      height={size()}
      class={`shrink-0 ${props.class ?? ""}`}
      style={{ color: props.color ?? entityColor(props.type) }}
      fill={style() === "fill" ? "currentColor" : "none"}
      stroke={style() === "parent-stroke" ? "currentColor" : "none"}
      stroke-width={style() === "parent-stroke" ? "2" : undefined}
      stroke-linecap={style() === "parent-stroke" ? "round" : undefined}
      stroke-linejoin={style() === "parent-stroke" ? "round" : undefined}
      innerHTML={entityIcon(props.type, props.icon)}
    />
  )
}
