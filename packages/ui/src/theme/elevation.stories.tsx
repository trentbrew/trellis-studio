// @ts-nocheck

const docs = `### Overview
Elevation ladder (\`--bg-*\`) for Studio shell depth — canvas through overlay.

Toggle **Theme** (toolbar) to compare light and dark. Each swatch uses the resolved CSS variable at runtime.

### Ladder
| Token | Level | Shell role |
| ----- | ----- | ---------- |
| \`bg-canvas\` | 0 | App root |
| \`bg-chrome\` | 1 | Activity rail, titlebar |
| \`bg-sidebar\` | 2 | Secondary nav |
| \`bg-panel\` | 3 | Panel frame |
| \`bg-well\` | 4 | Content well |
| \`bg-subtle\` | 5 | Cards, grouped content |
| \`bg-elevated\` | 6 | Sticky headers, dropdowns |
| \`bg-overlay\` | 7 | Dialogs, drawers |
| \`bg-scrim\` | — | Modal backdrop (alpha) |

Legacy \`background-*\` tokens alias the same values — see **Legacy aliases** story.

Spec: \`specs/ui-elevation-ontology.md\` · TRL-169 / TRL-170 / TRL-171
`

const steps = [
  { token: "bg-canvas", level: 0, role: "App root", tailwind: "bg-canvas", legacy: "background-base" },
  { token: "bg-chrome", level: 1, role: "Primary chrome", tailwind: "bg-chrome", legacy: null },
  { token: "bg-sidebar", level: 2, role: "Secondary nav", tailwind: "bg-sidebar", legacy: "background-weak" },
  { token: "bg-panel", level: 3, role: "Panel frame", tailwind: "bg-panel", legacy: "background-strong" },
  { token: "bg-well", level: 4, role: "Content well", tailwind: "bg-well", legacy: null },
  { token: "bg-subtle", level: 5, role: "Grouped content", tailwind: "bg-subtle", legacy: null },
  { token: "bg-elevated", level: 6, role: "Floating in flow", tailwind: "bg-elevated", legacy: "background-stronger" },
  { token: "bg-overlay", level: 7, role: "Modal layer", tailwind: "bg-overlay", legacy: null },
]

const scrim = { token: "bg-scrim", role: "Backdrop veil", tailwind: "bg-scrim", legacy: null }

function read(token: string) {
  if (typeof document === "undefined") return ""
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()
}

function Swatch(props: { token: string; level?: number; role: string; tailwind: string; legacy?: string | null }) {
  const value = read(props.token)
  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": "48px 1fr",
        gap: "12px",
        "align-items": "center",
        padding: "10px 12px",
        "border-radius": "8px",
        border: "1px solid var(--border-weak-base)",
        "background-color": `var(--${props.token})`,
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          "border-radius": "6px",
          border: "1px solid var(--border-base)",
          "background-color": `var(--${props.token})`,
        }}
      />
      <div style={{ display: "grid", gap: "4px", "font-size": "13px" }}>
        <div style={{ display: "flex", gap: "8px", "align-items": "baseline", "flex-wrap": "wrap" }}>
          <code style={{ "font-weight": "600" }}>{props.token}</code>
          {props.level !== undefined ? (
            <span style={{ color: "var(--text-weak)", "font-size": "12px" }}>L{props.level}</span>
          ) : null}
          <code style={{ color: "var(--text-interactive-base)", "font-size": "12px" }}>.{props.tailwind}</code>
        </div>
        <div style={{ color: "var(--text-weak)", "font-size": "12px" }}>{props.role}</div>
        <div
          style={{
            "font-family": "var(--font-family-mono)",
            "font-size": "11px",
            color: "var(--text-weaker)",
            "word-break": "break-all",
          }}
        >
          {value || "—"}
        </div>
        {props.legacy ? (
          <div style={{ "font-size": "11px", color: "var(--text-weaker)" }}>
            legacy: <code>{props.legacy}</code>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default {
  title: "Theme/Elevation",
  id: "theme-elevation",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
    layout: "fullscreen",
  },
}

export const Ladder = {
  render: () => (
    <div style={{ display: "grid", gap: "8px", "max-width": "640px" }}>
      {steps.map((step) => (
        <Swatch {...step} />
      ))}
      <Swatch {...scrim} />
    </div>
  ),
}

export const Stacked = {
  render: () => (
    <div
      class="bg-canvas"
      style={{
        padding: "24px",
        "min-height": "480px",
        display: "grid",
        "place-items": "center",
      }}
    >
      <div
        class="bg-chrome"
        style={{ padding: "16px", "border-radius": "12px", border: "1px solid var(--border-weak-base)" }}
      >
        <div
          class="bg-sidebar"
          style={{ padding: "16px", "border-radius": "10px", border: "1px solid var(--border-weak-base)" }}
        >
          <div
            class="bg-panel"
            style={{ padding: "16px", "border-radius": "8px", border: "1px solid var(--border-weak-base)" }}
          >
            <div
              class="bg-well"
              style={{ padding: "16px", "border-radius": "6px", border: "1px solid var(--border-weak-base)" }}
            >
              <div
                class="bg-subtle"
                style={{ padding: "16px", "border-radius": "6px", border: "1px solid var(--border-weak-base)" }}
              >
                <div
                  class="bg-elevated"
                  style={{
                    padding: "12px 16px",
                    "border-radius": "6px",
                    border: "1px solid var(--border-base)",
                    "font-size": "13px",
                  }}
                >
                  Elevated (L6)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const LegacyAliases = {
  render: () => {
    const pairs = steps.filter((step) => step.legacy)
    return (
      <div style={{ display: "grid", gap: "12px", "max-width": "720px" }}>
        <p style={{ margin: 0, color: "var(--text-weak)", "font-size": "13px" }}>
          Legacy OC-2 tokens should match their ladder alias (same computed color).
        </p>
        {pairs.map((step) => {
          const next = read(step.token)
          const old = read(step.legacy!)
          const match = next === old
          return (
            <div
              style={{
                display: "grid",
                "grid-template-columns": "1fr 1fr auto",
                gap: "12px",
                "align-items": "center",
                padding: "12px",
                "border-radius": "8px",
                border: "1px solid var(--border-weak-base)",
                "background-color": "var(--bg-panel)",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <code>{step.token}</code>
                <div
                  style={{
                    height: "40px",
                    "border-radius": "4px",
                    border: "1px solid var(--border-base)",
                    "background-color": `var(--${step.token})`,
                  }}
                />
                <span style={{ "font-size": "11px", "font-family": "monospace", color: "var(--text-weaker)" }}>
                  {next}
                </span>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <code>{step.legacy}</code>
                <div
                  style={{
                    height: "40px",
                    "border-radius": "4px",
                    border: "1px solid var(--border-base)",
                    "background-color": `var(--${step.legacy})`,
                  }}
                />
                <span style={{ "font-size": "11px", "font-family": "monospace", color: "var(--text-weaker)" }}>
                  {old}
                </span>
              </div>
              <span
                style={{
                  "font-size": "12px",
                  "font-weight": "600",
                  color: match ? "var(--text-diff-add-base)" : "var(--text-diff-delete-base)",
                }}
              >
                {match ? "match" : "mismatch"}
              </span>
            </div>
          )
        })}
      </div>
    )
  },
}
// lane smoke 1780091329
