import { createMemo, createResource, For, Show } from "solid-js"
import { useTrellis } from "@/context/trellis"
import { useEntityNavigate } from "./nav"
import { BacklinkCard, LinkCard, ReferenceCard, Section } from "./details"

// Per-entity Relationships tab. Surfaces just the relational data for this
// entity: outbound links, outgoing references, and incoming backlinks.
// Reuses the same fetch shape as EntityDetails (fetchEntity + fetchRefs) but
// strips out facts/file-metadata to keep the tab focused on connections.
export function EntityRelationships(props: { id: string; type: string | undefined }) {
  const trellis = useTrellis()
  const navigate = useEntityNavigate()

  const [ent] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchEntity(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const [refs] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchRefs(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const links = createMemo(() => ent.latest?.links ?? [])
  const outgoing = createMemo(() => refs.latest?.outgoing ?? [])
  const incoming = createMemo(() => refs.latest?.incoming ?? [])
  const loading = createMemo(() => ent.loading || refs.loading)
  const empty = createMemo(
    () => !loading() && links().length === 0 && outgoing().length === 0 && incoming().length === 0,
  )

  return (
    <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-4">
      <Show when={loading() && links().length === 0 && outgoing().length === 0 && incoming().length === 0}>
        <div class="flex items-center justify-center py-6">
          <div class="animate-spin h-4 w-4 rounded-full border-2 border-text-weaker border-t-transparent" />
        </div>
      </Show>

      <Show when={empty()}>
        <div class="rounded-md border border-border-base bg-background-base px-3 py-4 text-12-regular text-text-weak text-center">
          No relationships recorded
        </div>
      </Show>

      <Show when={links().length > 0}>
        <Section icon="arrow-right" title="Links">
          <div class="grid grid-cols-2 gap-2">
            <For each={links().slice(0, 48)}>
              {(l) => <LinkCard relation={l.a} target={l.e2} onClick={() => navigate(l.e2)} />}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={outgoing().length > 0}>
        <Section icon="link" title="References">
          <div class="grid grid-cols-2 gap-2">
            <For each={outgoing()}>
              {(r) => {
                const target = `${r.namespace}:${r.target}`
                const open = r.state === "resolved" && !!r.namespace && !!r.target
                return (
                  <ReferenceCard
                    title={r.title ?? target}
                    namespace={r.namespace}
                    state={r.state}
                    staleReason={r.staleReason}
                    onClick={() => open && navigate(target, r.namespace)}
                    disabled={!open}
                  />
                )
              }}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={incoming().length > 0}>
        <Section icon="arrow-left" title="Backlinks">
          <div class="grid grid-cols-1 gap-2">
            <For each={incoming()}>{(b) => <BacklinkCard filePath={b.filePath} line={b.line} />}</For>
          </div>
        </Section>
      </Show>
    </div>
  )
}
