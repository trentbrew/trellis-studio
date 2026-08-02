import type { JSX } from "solid-js"
import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

function cx(...vals: Array<string | false | undefined>) {
  return vals.filter(Boolean).join(" ")
}

export type PillTone = "neutral" | "info" | "success" | "warning" | "error" | "custom"

/**
 * Compact uppercase chip used for status, priority, type, and other small labels.
 * Replaces the recurring `text-10-medium uppercase rounded px-1.5 py-0.5 ...` pattern.
 *
 * Use `tone="custom"` with explicit `color` / `background` for one-off colored pills
 * (e.g. priority chips that use entity colors).
 */
export function Pill(props: {
  children: JSX.Element
  tone?: PillTone
  /** Custom text color — only applied when tone is "custom". */
  color?: string
  /** Custom background — only applied when tone is "custom". */
  background?: string
  /** Optional border color override. */
  border?: string
  icon?: JSX.Element
  title?: string
  class?: string
}) {
  const tone = () => props.tone ?? "neutral"
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-10-medium uppercase tracking-wide",
        tone() === "neutral" && "bg-surface-raised-base text-text-weak",
        tone() === "info" && "bg-surface-info/15 text-text-info border border-border-info/30",
        tone() === "success" && "bg-surface-success/15 text-text-success border border-border-success/30",
        tone() === "warning" && "bg-surface-warning/15 text-text-warning border border-border-warning/30",
        tone() === "error" && "bg-surface-error/15 text-text-error border border-border-error/30",
        props.class,
      )}
      style={
        tone() === "custom"
          ? {
              color: props.color,
              background: props.background ?? `color-mix(in oklch, ${props.color ?? "var(--text-weak)"} 16%, transparent)`,
              "border-color": props.border,
              "border-width": props.border ? "1px" : undefined,
              "border-style": props.border ? "solid" : undefined,
            }
          : undefined
      }
      title={props.title}
    >
      <Show when={props.icon}>{props.icon}</Show>
      {props.children}
    </span>
  )
}

/**
 * Section title used inside detail panels and dialogs.
 * Replaces the recurring `<Icon /> + uppercase tracking-wide` patterns.
 *
 * - `size="default"` (text-12 + text-weak) — used in dialog and inspector sections.
 * - `size="small"` (text-11 + text-weaker) — used in tighter insight/breakdown panels.
 */
export function SectionHeader(props: {
  label: JSX.Element
  icon?: string
  trailing?: JSX.Element
  size?: "default" | "small" | "xs"
  class?: string
}) {
  const size = () => props.size ?? "default"
  return (
    <div class={cx("flex items-center gap-2", props.class)}>
      <Show when={props.icon}>
        <Icon name={props.icon!} size="small" class="text-icon-weak" />
      </Show>
      <div
        class={cx(
          "uppercase tracking-wide",
          size() === "default" && "text-12-medium text-text-weak",
          size() === "small" && "text-11-medium text-text-weaker",
          size() === "xs" && "text-10-medium text-text-weak",
        )}
      >
        {props.label}
      </div>
      <Show when={props.trailing}>
        <>
          <div class="flex-1" />
          {props.trailing}
        </>
      </Show>
    </div>
  )
}

/**
 * Tabular "N/M" count badge — used as a visible-vs-total indicator in toolbars.
 * Renders a small mono chip with tabular-nums.
 */
export function CountBadge(props: { current: number; total: number; class?: string; title?: string }) {
  return (
    <div
      class={cx(
        "inline-flex h-7 items-center rounded-md border border-border-base/50 bg-surface-raised-base/30 px-2 text-11-regular tabular-nums text-text-weak",
        props.class,
      )}
      title={props.title}
    >
      {props.current}/{props.total}
    </div>
  )
}

/**
 * Compact label/value pair used in inspector sidebars and detail panels.
 * Replaces the recurring "rounded border bg-background-base + uppercase label + value" pattern.
 */
export function MetaField(props: {
  label: JSX.Element
  value: JSX.Element
  /** Tooltip applied to the value text. Useful when value can overflow. */
  title?: string
  class?: string
}) {
  return (
    <div
      class={cx(
        "rounded-md border border-border-base/60 bg-background-base px-2.5 py-1.5 min-w-0 flex flex-col gap-0.5",
        props.class,
      )}
    >
      <div class="text-10-medium uppercase tracking-wide text-text-weaker">{props.label}</div>
      <div class="truncate text-11-regular text-text-strong" title={props.title}>
        {props.value}
      </div>
    </div>
  )
}

/**
 * Tag chip — small rounded pill for labels, used in card tag rows and detail panels.
 */
export function TagChip(props: {
  children: JSX.Element
  onRemove?: () => void
  class?: string
  title?: string
}) {
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1 rounded-full bg-surface-raised-base px-2 py-0.5 text-10-medium text-text-weak",
        props.class,
      )}
      title={props.title}
    >
      {props.children}
      <Show when={props.onRemove}>
        <button
          type="button"
          aria-label="Remove tag"
          class="inline-flex size-3 items-center justify-center rounded-full text-text-weaker hover:text-text-base"
          onClick={(e) => {
            e.stopPropagation()
            props.onRemove?.()
          }}
        >
          <Icon name="close-small" size="small" />
        </button>
      </Show>
    </span>
  )
}
