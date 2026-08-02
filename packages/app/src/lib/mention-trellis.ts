import { buildEntityLabelIndex } from "@/components/cms/display"
import type { TrellisStoreEntity } from "@/context/trellis"
import type { StoreFact } from "@/context/trellis-store"
import type { TrellisCtx } from "@/lib/mention-search"

type TrellisLike = {
  ready: boolean
  issues: TrellisCtx["issues"]
  storeEntities: TrellisStoreEntity[]
  fetchStoreEntities: (force?: boolean) => Promise<TrellisStoreEntity[]>
  fetchDecisions: TrellisCtx["fetchDecisions"]
  fetchMilestones: TrellisCtx["fetchMilestones"]
}

export function mentionTrellisCtx(
  trellis: TrellisLike | undefined,
  facts?: readonly StoreFact[],
): TrellisCtx | undefined {
  if (!trellis) return undefined
  const entityLabels = facts && facts.length > 0 ? buildEntityLabelIndex(facts) : undefined
  return {
    ready: trellis.ready,
    issues: trellis.issues,
    storeEntities: trellis.storeEntities,
    fetchStoreEntities: trellis.fetchStoreEntities,
    fetchDecisions: trellis.fetchDecisions,
    fetchMilestones: trellis.fetchMilestones,
    entityLabels,
  }
}
