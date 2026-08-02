import { resolveEntityLabel } from "@/components/cms/display"
import type { MentionItem } from "@/lib/tiptap/mention-suggestion"

type FileCtx = {
  searchFiles: (query: string) => Promise<string[]>
}

type SyncCtx = {
  data: {
    agent: Array<{ name: string; hidden?: boolean; mode?: string; description?: string }>
  }
}

export type TrellisCtx = {
  ready: boolean
  issues: Array<{ id: string; title: string }>
  fetchDecisions: (opts?: {
    tool?: string
    agent?: string
    limit?: number
  }) => Promise<Array<{ id: string; toolName: string }>>
  fetchMilestones: () => Promise<Array<{ id: string; message?: string | null }>>
  storeEntities?: Array<{ id: string; type: string; label?: string }>
  fetchStoreEntities?: (force?: boolean) => Promise<Array<{ id: string; type: string; label?: string }>>
  entityLabels?: ReadonlyMap<string, string> | Record<string, string>
}

const MAX_AGENTS = 5
const MAX_ENTITIES = 14
const MAX_FILES = 10

/** @deprecated Use resolveEntityLabel from @/components/cms/display */
export function entityLabel(id: string): string {
  return resolveEntityLabel(id)
}

export function entityRank(entity: { id: string; type: string }): number {
  const id = entity.id.toLowerCase()
  const type = entity.type.toLowerCase()
  if (id.startsWith("schema:") || type === "typeschema") return 7
  if (id.startsWith("file:") || id.startsWith("dir:") || id.startsWith("branch:")) return 6
  if (type === "filenode" || type === "directory" || type === "branch") return 6
  if (id.startsWith("decision:") || type === "decision") return 5
  if (id.startsWith("criterion:") || type === "criterion") return 4
  if (id.startsWith("milestone:") || type === "milestone") return 3
  if (id.startsWith("issue:") || type === "issue") return 2
  return 0
}

function match(item: MentionItem, q: string): boolean {
  if (!q) return true
  return (
    item.id.toLowerCase().includes(q) ||
    item.label.toLowerCase().includes(q) ||
    (item.detail ?? "").toLowerCase().includes(q)
  )
}

function entityMention(
  id: string,
  type: string,
  label: string | undefined,
  trellis?: TrellisCtx,
): MentionItem {
  return {
    type: "entity",
    id,
    label: resolveEntityLabel(id, { label, labels: trellis?.entityLabels }),
    detail: type,
  }
}

export async function searchMentions(opts: {
  query: string
  file: FileCtx
  sync?: SyncCtx
  trellis?: TrellisCtx
}): Promise<MentionItem[]> {
  const q = opts.query.trim().toLowerCase()
  const out: MentionItem[] = []

  const agents = opts.sync?.data.agent.filter((a) => !a.hidden && a.mode !== "primary") ?? []
  const agentMatches = agents
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .slice(0, MAX_AGENTS)
    .map(
      (a): MentionItem => ({
        type: "agent",
        id: a.name,
        label: a.name,
        detail: a.description,
      }),
    )
  out.push(...agentMatches)

  if (opts.trellis?.ready) {
    const entities: MentionItem[] = []
    const ranks = new Map<string, number>()
    const seen = new Set<string>()
    const add = (item: MentionItem, rank: number) => {
      if (seen.has(item.id)) return
      seen.add(item.id)
      ranks.set(item.id, rank)
      entities.push(item)
    }
    const stored = opts.trellis.storeEntities?.length
      ? opts.trellis.storeEntities
      : ((await opts.trellis.fetchStoreEntities?.()) ?? [])
    for (const e of stored) {
      add(entityMention(e.id, e.type, e.label, opts.trellis), entityRank(e))
    }
    for (const i of opts.trellis.issues) {
      add(
        { type: "entity", id: i.id, label: i.id, detail: i.title },
        entityRank({ id: i.id, type: "issue" }),
      )
    }
    try {
      const decisions = await opts.trellis.fetchDecisions({ limit: 20 })
      for (const d of decisions) {
        add(
          { type: "entity", id: d.id, label: d.id, detail: d.toolName },
          entityRank({ id: d.id, type: "decision" }),
        )
      }
    } catch {}
    try {
      const milestones = await opts.trellis.fetchMilestones()
      for (const m of milestones) {
        add(
          {
            type: "entity",
            id: m.id,
            label: m.id,
            detail: m.message ?? undefined,
          },
          entityRank({ id: m.id, type: "milestone" }),
        )
      }
    } catch {}

    const filtered = entities
      .filter((e) => match(e, q))
      .sort((a, b) => (ranks.get(a.id) ?? 9) - (ranks.get(b.id) ?? 9) || a.label.localeCompare(b.label))
    out.push(...filtered.slice(0, MAX_ENTITIES))
  }

  const paths = await opts.file.searchFiles(opts.query)
  const fileMatches: MentionItem[] = paths.slice(0, MAX_FILES).map((p) => ({
    type: "file",
    id: p,
    label: p.split("/").pop() || p,
    detail: p,
  }))
  out.push(...fileMatches)

  if (q) {
    const exists = paths.some((p) => {
      const name = p.split("/").pop() || p
      return name.toLowerCase() === q || name.toLowerCase() === `${q}.md`
    })
    if (!exists) {
      const safe = opts.query.trim().replace(/^\/+|\/+$/g, "")
      const hasExt = /\.[a-z0-9]+$/i.test(safe)
      const target = hasExt ? safe : `${safe}.md`
      if (!target.split("/").some((seg) => !seg || seg === "." || seg === "..")) {
        out.push({
          type: "create",
          id: target,
          label: `Create ${target}`,
        })
      }
    }
  }

  return out
}
