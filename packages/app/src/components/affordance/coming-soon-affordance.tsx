import type { ProjectionDefinition } from "@/lib/projections/types"
import { RouteEmptyState } from "@/components/route"
import { AffordanceShell } from "@/components/affordance/affordance-shell"

export function ComingSoonAffordance(props: { projection: ProjectionDefinition }) {
  return (
    <AffordanceShell id={props.projection.id} title={props.projection.label} padded scroll={false}>
      <RouteEmptyState
        title={`${props.projection.label} coming soon`}
        description={props.projection.description}
      />
    </AffordanceShell>
  )
}
