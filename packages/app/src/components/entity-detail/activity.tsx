import { createMemo, createResource, For, Show } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useTrellis, type TrellisDecision, type TrellisOp } from "@/context/trellis"
import { TrellisOpBadge } from "@/pages/trellis-op-icon"
import { ago, isFileEntity, pathFromId } from "./helpers"

type Entry = { kind: "op"; ts: number; op: TrellisOp } | { kind: "decision"; ts: number; decision: TrellisDecision }

const MAX_ENTRIES = 100

// kind filter lets the same data pipeline render an ops-only, decisions-only,
// or merged stream. Used by the per-entity History and Decisions tabs.
export function EntityActivity(props: { id: string; type: string | undefined; kind?: "op" | "decision" | "all" }) {
  const trellis = useTrellis()
  const filePath = createMemo(() => (isFileEntity(props.type) ? pathFromId(props.id) : undefined))
  const filter = () => props.kind ?? "all"

  const [ops] = createResource(
    () => filePath() ?? "__none__",
    async (next) => {
      if (next === "__none__") return [] as TrellisOp[]
      try {
        return await trellis.fetchOps(MAX_ENTRIES, next)
      } catch {
        return [] as TrellisOp[]
      }
    },
    { initialValue: [] as TrellisOp[] },
  )

  const [decisions] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchDecisionChain(next)
      } catch {
        return [] as TrellisDecision[]
      }
    },
    { initialValue: [] as TrellisDecision[] },
  )

  const entries = createMemo<Entry[]>(() => {
    const f = filter()
    const opsList: Entry[] =
      f === "decision"
        ? []
        : (ops.latest ?? []).map((op) => ({
            kind: "op" as const,
            ts: new Date(op.timestamp).getTime() || 0,
            op,
          }))
    const decList: Entry[] =
      f === "op"
        ? []
        : (decisions.latest ?? []).map((d) => ({
            kind: "decision" as const,
            ts: new Date(d.timestamp).getTime() || 0,
            decision: d,
          }))
    return [...opsList, ...decList].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES)
  })

  const loading = createMemo(() => ops.loading || decisions.loading)
  const empty = createMemo(() => !loading() && entries().length === 0)

  return (
    <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1.5">
      <Show when={loading() && entries().length === 0}>
        <div class="flex items-center gap-2 text-text-weak">
          <Spinner />
          <span class="text-12-regular">Loading activity...</span>
        </div>
      </Show>

      <Show when={empty()}>
        <div class="rounded-md border border-border-base bg-background-base px-3 py-4 text-12-regular text-text-weak text-center">
          No activity recorded
        </div>
      </Show>

      <For each={entries()}>{(entry) => <EntryRow entry={entry} />}</For>
    </div>
  )
}

function EntryRow(props: { entry: Entry }) {
  return (
    <Show
      when={props.entry.kind === "op"}
      fallback={<DecisionRow decision={(props.entry as Extract<Entry, { kind: "decision" }>).decision} />}
    >
      <OpRow op={(props.entry as Extract<Entry, { kind: "op" }>).op} />
    </Show>
  )
}

function OpRow(props: { op: TrellisOp }) {
  const meta = createMemo(() => {
    const parts: string[] = []
    if (props.op.branchName) parts.push(props.op.branchName)
    if (props.op.milestoneMessage) parts.push(props.op.milestoneMessage)
    return parts.join(" · ")
  })
  return (
    <div class="rounded-md border border-border-base/60 bg-background-base px-2.5 py-1.5 flex items-start gap-2">
      <div class="flex-1 min-w-0">
        <TrellisOpBadge kind={props.op.kind} />
        <Show when={meta()}>
          <div class="mt-0.5 text-10-regular text-text-weaker truncate" title={meta()}>
            {meta()}
          </div>
        </Show>
      </div>
      <div class="shrink-0 text-10-regular text-text-weaker tabular-nums" title={props.op.timestamp}>
        {ago(props.op.timestamp)}
      </div>
    </div>
  )
}

function DecisionRow(props: { decision: TrellisDecision }) {
  return (
    <div class="rounded-md border border-border-base/60 bg-background-base px-2.5 py-1.5 flex items-start gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 text-12-medium text-text-strong">
          <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-text-weak">
            decision
          </span>
          <span class="truncate font-mono">{props.decision.toolName}</span>
        </div>
        <Show when={props.decision.outputSummary}>
          <div class="mt-0.5 text-10-regular text-text-weaker line-clamp-2">{props.decision.outputSummary}</div>
        </Show>
      </div>
      <div class="shrink-0 text-10-regular text-text-weaker tabular-nums" title={props.decision.timestamp}>
        {ago(props.decision.timestamp)}
      </div>
    </div>
  )
}
