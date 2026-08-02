import { createMemo, createResource, For, Show } from "solid-js"
import { useTrellis, type TrellisOp } from "@/context/trellis"
import { TrellisOpBadge } from "@/pages/trellis-op-icon"
import { typeKey } from "@/pages/session/database-panel-utils"

function timeAgo(ts: string) {
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function summary(op: TrellisOp) {
  const attrs = op.storeAttrs ?? []
  if (attrs.includes("props")) return "Schema properties updated"
  const meta = attrs.filter((a) => a !== "type")
  if (meta.length > 0) return `Updated ${meta.join(", ")}`
  if (op.kind === "vcs:storeRetract") return "Facts retracted"
  return "Store change"
}

export function SchemaVersions(props: { type: string }) {
  const trellis = useTrellis()
  const schemaId = () => `schema:${typeKey(props.type)}`
  const [ops] = createResource(
    () => schemaId(),
    async (id) => trellis.fetchOps(200, undefined, id),
  )

  const list = createMemo(() => {
    const raw = ops() ?? []
    return raw
      .filter((op) => op.kind === "vcs:storeAssert" || op.kind === "vcs:storeRetract")
      .slice()
      .reverse()
  })

  return (
    <div class="db-schema-versions">
      <p class="db-schema-versions-note">
        Reconstructed from the causal op log. Each entry is a store assert or retract that touched this type schema.
      </p>
      <Show
        when={!ops.loading}
        fallback={<div class="py-6 text-center text-12-regular text-text-weaker">Loading history…</div>}
      >
        <Show
          when={list().length > 0}
          fallback={
            <div class="py-6 text-center text-12-regular text-text-weaker">
              No schema changes recorded yet. Saving from Configure or Properties creates the first version.
            </div>
          }
        >
          <ul class="db-schema-versions-list">
            <For each={list()}>
              {(op) => (
                <li class="db-schema-versions-item">
                  <TrellisOpBadge kind={op.kind} class="shrink-0 min-w-0" />
                  <div class="min-w-0 flex-1">
                    <div class="text-12-medium text-text-base truncate">{summary(op)}</div>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-10-regular text-text-weaker mt-0.5">
                      <span>{timeAgo(op.timestamp)}</span>
                      <span class="font-mono opacity-60">{op.hash.slice(0, 8)}</span>
                      <Show when={op.branchName}>
                        <span class="font-mono">{op.branchName}</span>
                      </Show>
                    </div>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  )
}
