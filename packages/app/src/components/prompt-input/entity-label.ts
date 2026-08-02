import { resolveEntityLabel } from "@/components/cms/display"
import type { ContentPart, EntityPart } from "@/context/prompt"
import type { TrellisCtx } from "@/lib/mention-search"

type EntityLabelContext = Pick<TrellisCtx, "entityLabels" | "storeEntities" | "issues"> & {
  decisions?: Array<{ id: string; toolName: string }>
  milestones?: Array<{ id: string; title?: string | null }>
}

export function resolveEntityPartLabel(part: EntityPart, ctx?: EntityLabelContext): string {
  const stored = part.label?.trim()
  if (stored) return stored

  if (ctx) {
    const storeEntity = ctx.storeEntities?.find((entity) => entity.id === part.entityId)
    if (storeEntity) {
      return resolveEntityLabel(part.entityId, { label: storeEntity.label, labels: ctx.entityLabels })
    }

    if (part.entityType === "issue") {
      const issue = ctx.issues.find((entry) => entry.id === part.entityId)
      if (issue) return `${issue.id}: ${issue.title}`
    }

    if (part.entityType === "decision") {
      const decision = ctx.decisions?.find((entry) => entry.id === part.entityId)
      if (decision) return decision.toolName
    }

    if (part.entityType === "milestone") {
      const milestone = ctx.milestones?.find((entry) => entry.id === part.entityId)
      if (milestone?.title) return milestone.title
    }
  }

  return resolveEntityLabel(part.entityId, { labels: ctx?.entityLabels })
}

export function entityPartDisplayText(part: EntityPart, ctx?: EntityLabelContext): string {
  return `@${resolveEntityPartLabel(part, ctx)}`
}

export function entityPartVisibleText(part: EntityPart, ctx?: EntityLabelContext): string {
  if (part.content.startsWith("#")) return part.content
  if (part.content.startsWith("[[")) return part.content
  return entityPartDisplayText(part, ctx)
}

export function partVisibleText(part: ContentPart, ctx?: EntityLabelContext): string {
  if (part.type === "entity") return entityPartVisibleText(part, ctx)
  if ("content" in part) return part.content
  return ""
}
