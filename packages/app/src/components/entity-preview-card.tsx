import { EntityIcon, entityColor, entityTypeLabel } from "@/lib/entity-theme"
import { entityShellClass, SHELL_ACCENT } from "@/lib/entity-shell"
import type { EntityPreviewData } from "@/lib/entity-summary"

export function EntityPreviewCard(props: { data: EntityPreviewData; compact?: boolean }) {
  const shell = () => entityShellClass(props.data.type)
  const accent = () => SHELL_ACCENT[shell()]
  const color = () => entityColor(props.data.type)

  return (
    <div
      data-ui-component="app.entity.preview-card"
      class="overflow-hidden rounded-lg border border-border-weaker-base bg-surface-base shadow-lg"
      style={{ "border-top": `2px solid ${accent()}` }}
    >
      <div class="flex items-start gap-2.5 px-3 py-2.5 border-b border-border-weaker-base/60">
        <span
          class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${color()}18`, color: color() }}
        >
          <EntityIcon type={props.data.type} size={14} />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span
              class="rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide"
              style={{ background: `${accent()}22`, color: accent() }}
            >
              {entityTypeLabel(props.data.type)}
            </span>
          </div>
          <div class="truncate text-12-medium text-text-strong mt-0.5">{props.data.title}</div>
          {props.data.subtitle && !props.compact ? (
            <div class="line-clamp-2 text-11-regular text-text-weak mt-0.5">{props.data.subtitle}</div>
          ) : null}
        </div>
      </div>
      {props.data.snippet ? (
        <div
          class={`px-3 py-2 text-11-regular text-text-weak leading-relaxed ${props.compact ? "line-clamp-3" : "line-clamp-4"}`}
        >
          {props.data.snippet}
        </div>
      ) : null}
      <div class="px-3 py-1.5 text-[10px] text-text-weaker border-t border-border-weaker-base/40">
        Click to open
      </div>
    </div>
  )
}
