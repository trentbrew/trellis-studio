import { createMemo, createResource, Show } from "solid-js"
import { Tabs } from "@opencode-ai/ui/tabs"
import { EntitySurface } from "@/components/entity-detail"
import { useTrellisOptional } from "@/context/trellis"
import { resolveTitle } from "@/components/entity-detail/adapters"
import { idFromEntityTab, typeFromEntityId } from "@/lib/entity-tab"

export function EntityTabContent(props: { tab: string }) {
  const trellis = useTrellisOptional()
  const id = createMemo(() => idFromEntityTab(props.tab))
  const type = createMemo(() => {
    const next = id()
    return next ? typeFromEntityId(next) : undefined
  })
  const [ent] = createResource(
    id,
    async (next) => {
      if (!next || !trellis) return undefined
      try {
        return await trellis.fetchEntity(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )
  const title = createMemo(() => {
    const next = id()
    if (!next) return undefined
    return resolveTitle({ id: next, type: type(), facts: ent.latest?.facts ?? [] })
  })

  return (
    <Tabs.Content value={props.tab} class="mt-0 relative h-full min-h-0 flex flex-col overflow-hidden">
      <Show when={id()}>
        {(eid) => (
          <EntitySurface
            id={eid()}
            type={type()}
            title={title()}
            layout="panel"
            header={false}
            class="flex-1 min-h-0"
          />
        )}
      </Show>
    </Tabs.Content>
  )
}
