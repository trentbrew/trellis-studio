import { createMemo, Show } from "solid-js"
import { useTrellisStore } from "@/context/trellis-store"
import { matchesType } from "@/pages/session/database-panel-utils"
import type { EntityTheme } from "@/lib/entity-theme"

export type TypeDeleteImpact = {
  type: string
  label: string
  entities: number
  facts: number
  links: number
  inbound: number
  outbound: number
  hasSchema: boolean
}

export function typeDeleteImpact(
  type: string,
  theme: EntityTheme,
  hasSchema: boolean,
  store: ReturnType<typeof useTrellisStore>,
): TypeDeleteImpact {
  const ids = new Set<string>()
  for (const e of store.entities) {
    if (!matchesType(e.type, type)) continue
    ids.add(e.id)
  }
  let facts = 0
  let outbound = 0
  let inbound = 0
  for (const f of store.facts) {
    if (!ids.has(f.e)) continue
    facts++
  }
  for (const link of store.links) {
    const from = ids.has(link.e1)
    const to = ids.has(link.e2)
    if (!from && !to) continue
    if (from) outbound++
    if (to && !from) inbound++
  }
  return {
    type,
    label: theme.label,
    entities: ids.size,
    facts,
    links: outbound + inbound,
    inbound,
    outbound,
    hasSchema,
  }
}

export function TypeDeleteDialog(props: {
  open: boolean
  impact: TypeDeleteImpact | null
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const blocked = createMemo(() => (props.impact?.entities ?? 0) > 0)

  return (
    <Show when={props.open && props.impact}>
      {(impact) => (
        <div
          class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          onClick={props.onClose}
        >
          <div
            class="w-full max-w-md rounded-lg border border-border-weaker-base bg-background-base shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="border-b border-border-weaker-base px-4 py-3">
              <div class="text-13-medium text-text-strong">Delete {impact().label}?</div>
              <div class="text-11-regular text-text-weaker mt-0.5 font-mono">{impact().type}</div>
            </div>
            <div class="px-4 py-3 flex flex-col gap-3 text-12-regular text-text-base">
              <Show
                when={blocked()}
                fallback={
                  <p class="text-text-weak m-0">
                    This removes the type schema (label, properties, color, icon). No records use this type
                    right now.
                  </p>
                }
              >
                <p class="text-text-weak m-0">
                  This type still has data in the store. Deleting the type definition would leave records
                  orphaned and can break graph links and queries.
                </p>
              </Show>
              <ul class="m-0 pl-4 flex flex-col gap-1 text-12-regular text-text-weak list-disc">
                <li>
                  <span class="text-text-base tabular-nums">{impact().entities}</span> record
                  {impact().entities !== 1 ? "s" : ""}
                </li>
                <li>
                  <span class="text-text-base tabular-nums">{impact().facts}</span> fact
                  {impact().facts !== 1 ? "s" : ""} on those records
                </li>
                <li>
                  <span class="text-text-base tabular-nums">{impact().links}</span> relationship
                  {impact().links !== 1 ? "s" : ""}
                  {impact().inbound > 0 ? ` (${impact().inbound} inbound)` : ""}
                </li>
                <Show when={impact().hasSchema}>
                  <li>TypeSchema definition will be retracted from the store</li>
                </Show>
              </ul>
              <Show when={blocked()}>
                <p class="text-11-regular text-text-weaker m-0">
                  Remove or reassign records first, or add a dedicated “delete all records” flow with cascade
                  review before we allow type removal.
                </p>
              </Show>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-border-weaker-base px-4 py-3">
              <button type="button" class="db-action-btn" onClick={props.onClose}>
                Cancel
              </button>
              <Show when={!blocked()}>
                <button
                  type="button"
                  class="db-action-btn db-action-btn--danger"
                  disabled={props.busy}
                  onClick={() => props.onConfirm()}
                >
                  {props.busy ? "Deleting…" : "Delete type"}
                </button>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
