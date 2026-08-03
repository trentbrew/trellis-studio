import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createEffect, createSignal, onCleanup, Show, For } from "solid-js"
import { useSDK } from "../../context/sdk"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"

/**
 * Trellis desk affordances (Phase 2): lane-op commands + presence panel.
 *
 * Commands are slash-accessible (/lane-status, /lane-promote, /issue-check,
 * /issue-close, /milestone-create, /garden-list) and every one is AC-gated or
 * confirm-gated — nothing here promotes without a human decision.
 */

const id = "internal:lane"

type LaneStatusInfo = {
  laneID?: string
  status?: string
  issueId?: string
  worktreePath?: string
  dirty?: boolean
}

type PresenceRow = {
  sessionId: string
  agentId: string
  displayName: string
  client?: string
  laneId?: string
  laneStatus?: string
  issueId?: string
  issueTitle?: string
  status?: string
}

async function trellis<T>(api: TuiPluginApi, path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const client = (api.client as unknown as {
    _client: {
      get: (o: { url: string; query?: Record<string, string> }) => Promise<{ data?: T; error?: unknown }>
      post: (o: { url: string; query?: Record<string, string>; body?: unknown }) => Promise<{ data?: T; error?: unknown }>
    }
  })._client
  const method = opts?.method ?? "GET"
  const call = method === "POST" ? client.post : client.get
  const res = await call({ url: path, body: opts?.body })
  if (res.error) throw new Error(String(res.error))
  return res.data as T
}

function currentSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  return (route.params as { sessionID?: string } | undefined)?.sessionID
}

function shortLane(laneID?: string): string {
  if (!laneID) return "—"
  return laneID.length > 12 ? `…${laneID.slice(-10)}` : laneID
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Lane status",
      value: "lane.status",
      description: "Show this session's lane: dirty state, issue, worktree",
      category: "Trellis",
      slash: { name: "lane-status" },
      enabled: api.route.current.name === "session",
      async onSelect() {
        const sessionID = currentSessionID(api)
        const status = await trellis<LaneStatusInfo>(api, `/trellis/lane-status?sessionID=${sessionID ?? ""}`)
        if (!status.laneID) {
          api.ui.toast({ title: "No lane bound to this session", message: "" })
          return
        }
        api.ui.toast({
          title: `lane ${shortLane(status.laneID)}${status.dirty ? " (dirty)" : " (clean)"}`,
          message: status.issueId ? `issue ${status.issueId}` : "no issue",
        })
      },
    },
    {
      title: "Promote lane",
      value: "lane.promote",
      description: "Promote a lane to integration (tests must pass)",
      category: "Trellis",
      slash: { name: "lane-promote" },
      async onSelect() {
        const sessionID = currentSessionID(api)
        const status = await trellis<LaneStatusInfo>(api, `/trellis/lane-status?sessionID=${sessionID ?? ""}`)
        const laneID = status.laneID
        if (!laneID) {
          api.ui.toast({ title: "No lane bound to this session", message: "" })
          return
        }
        api.ui.dialog.replace(() => (
          <api.ui.DialogConfirm
            title="Promote lane"
            message={`Promote ${shortLane(laneID)} to integration? Tests must pass.`}
            onConfirm={async () => {
              api.ui.dialog.clear()
              const result = await trellis<{ promoted: boolean; error?: string }>(api, "/trellis/lane-promote", {
                method: "POST",
                body: { laneId: status.laneID },
              })
              api.ui.toast({
                title: result.promoted ? "Lane promoted" : "Promote failed",
                message: result.error ?? (result.promoted ? "milestone created" : "not promoted"),
              })
            }}
            onCancel={() => api.ui.dialog.clear()}
          />
        ))
      },
    },
    {
      title: "Issue check (ACs)",
      value: "issue.check",
      description: "Run an issue's acceptance criteria",
      category: "Trellis",
      slash: { name: "issue-check" },
      async onSelect() {
        api.ui.dialog.replace(() => (
          <api.ui.DialogPrompt
            title="Issue id"
            placeholder="TRL-1"
            onConfirm={async (value) => {
              api.ui.dialog.clear()
              const results = await trellis<Array<{ criterionId?: string; status?: string; command?: string }>>(
                api,
                `/trellis/issues/${value}/check`,
                { method: "POST" },
              )
              const passed = (results ?? []).filter((r) => r.status === "passed").length
              const failed = (results ?? []).filter((r) => r.status === "failed").length
              api.ui.toast({ title: `${value}: ${passed} passed / ${failed} failed`, message: `${results?.length ?? 0} criteria` })
            }}
            onCancel={() => api.ui.dialog.clear()}
          />
        ))
      },
    },
    {
      title: "Issue close (AC-bound)",
      value: "issue.close",
      description: "Close an issue — criteria must pass; promote happens only on confirm",
      category: "Trellis",
      slash: { name: "issue-close" },
      async onSelect() {
        api.ui.dialog.replace(() => (
          <api.ui.DialogPrompt
            title="Issue id"
            placeholder="TRL-1"
            onConfirm={async (value) => {
              api.ui.dialog.clear()
                const first = await trellis<{ closed: boolean; reason?: string; results?: unknown[] }>(
                  api,
                  `/trellis/issues/${value}/close`,
                  { method: "POST", body: { confirm: false } },
                )
                if (first.closed) {
                  api.ui.toast({ title: `${value} closed`, message: "lane promoted" })
                  return
                }
                if (first.reason === "criteria-not-passed") {
                  api.ui.toast({ title: `${value}: criteria not passed`, message: "Run /issue-check first" })
                  return
                }
                api.ui.dialog.replace(() => (
                  <api.ui.DialogConfirm
                    title="Close issue"
                    message={`ACs passed for ${value}. Close and auto-promote its lane?`}
                    onConfirm={async () => {
                      api.ui.dialog.clear()
                        const result = await trellis<{ closed: boolean; promoteResult?: boolean; error?: string }>(
                          api,
                          `/trellis/issues/${value}/close`,
                          { method: "POST", body: { confirm: true } },
                        )
                        api.ui.toast({
                          title: result.closed ? `${value} closed` : "Close failed",
                          message: result.error ?? (result.promoteResult ? "lane auto-promoted" : "not promoted"),
                        })
                      }}
                      onCancel={() => api.ui.dialog.clear()}
                    />
                ))
              }}
              onCancel={() => api.ui.dialog.clear()}
            />
          ))
      },
    },
    {
      title: "Milestone create",
      value: "milestone.create",
      description: "Create a narrative milestone",
      category: "Trellis",
      slash: { name: "milestone-create" },
      async onSelect() {
        api.ui.dialog.replace(() => (
          <api.ui.DialogPrompt
            title="Milestone message"
            placeholder="Completed X"
            onConfirm={async (value) => {
              api.ui.dialog.clear()
                const result = await trellis<{ milestoneId?: string; error?: string }>(api, "/trellis/milestones", {
                  method: "POST",
                  body: { message: value },
                })
                api.ui.toast({ title: result.milestoneId ? `Milestone ${result.milestoneId}` : "Milestone failed", message: result.error ?? "" })
              }}
              onCancel={() => api.ui.dialog.clear()}
            />
          ))
      },
    },
    {
      title: "Garden list",
      value: "garden.list",
      description: "List abandoned-work clusters",
      category: "Trellis",
      slash: { name: "garden-list" },
      async onSelect() {
        const clusters = await trellis<Array<{ id: string; label?: string; fileCount?: number; branch?: string }>>(
          api,
          "/trellis/garden",
        )
        if (!clusters || clusters.length === 0) {
          api.ui.toast({ title: "Garden is empty", message: "" })
          return
        }
        api.ui.dialog.replace(() => (
          <api.ui.DialogAlert
            title={`${clusters.length} cluster(s)`}
            message={clusters.slice(0, 10).map((c) => `${c.id} — ${c.label ?? "untitled"} (${c.fileCount ?? 0} files)`).join("\n")}
            onConfirm={() => api.ui.dialog.clear()}
          />
        ))
      },
    },
    {
      title: "Decision chain",
      value: "decision.chain",
      description: "Show this session's decision traces (tool gates)",
      category: "Trellis",
      slash: { name: "decision-chain" },
      enabled: api.route.current.name === "session",
      async onSelect() {
        const traces = await trellis<Array<{ id?: string; toolName?: string; rationale?: string; timestamp?: string }>>(
          api,
          "/trellis/decisions?limit=15",
        )
        if (!traces || traces.length === 0) {
          api.ui.toast({ title: "No decision traces", message: "no tool gates recorded this session" })
          return
        }
        api.ui.dialog.replace(() => (
          <api.ui.DialogAlert
            title={`${traces.length} decision(s)`}
            message={traces.slice(0, 10).map((d) => `[${d.toolName ?? "?"}]${d.rationale ? ` — ${d.rationale}` : ""}`).join("\n")}
            onConfirm={() => api.ui.dialog.clear()}
          />
        ))
      },
    },
  ])

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content() {
        return <LanePanel />
      },
    },
  })
}

function LanePanel() {
  const theme = () => useTheme().theme
  const sdk = useSDK()
  const route = useRoute()
  const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)

  const [lane, setLane] = createSignal<LaneStatusInfo | null>(null)
  const [agents, setAgents] = createSignal<PresenceRow[]>([])

  const poll = async () => {
    try {
      const dir = sdk.directory ? `?directory=${encodeURIComponent(sdk.directory)}` : ""
      const [laneRes, presenceRes] = await Promise.all([
        fetch(`${sdk.url}/trellis/lane-status${dir}${sessionID() ? `&sessionID=${encodeURIComponent(sessionID()!)}` : ""}`, {
          headers: { "x-opencode-directory": sdk.directory ? encodeURIComponent(sdk.directory) : "" },
        }),
        fetch(`${sdk.url}/trellis/presence${dir}`, {
          headers: { "x-opencode-directory": sdk.directory ? encodeURIComponent(sdk.directory) : "" },
        }),
      ])
      if (laneRes.ok) setLane((await laneRes.json()) as LaneStatusInfo)
      if (presenceRes.ok) setAgents((await presenceRes.json()) as PresenceRow[])
    } catch {
      // server not ready — retry on next tick
    }
  }

  createEffect(() => {
    void sessionID()
    void poll()
    const t = setInterval(poll, 5000)
    onCleanup(() => clearInterval(t))
  })

  return (
    <box flexDirection="column">
      <Show when={lane()?.laneID}>
        <text fg={theme().text}>
          <b>Lane</b>
        </text>
        <text fg={lane()?.dirty ? theme().warning : theme().success}>
          {shortLane(lane()?.laneID)} {lane()?.dirty ? "• dirty" : "• clean"}
        </text>
        <Show when={lane()?.issueId}>
          <text fg={theme().textMuted}>issue {lane()?.issueId}</text>
        </Show>
      </Show>
      <text fg={theme().text}>
        <b>Agents</b>
      </text>
      <Show
        when={agents().length > 0}
        fallback={<text fg={theme().textMuted}>no other agents live</text>}
      >
        <For each={agents()}>
          {(agent) => (
            <text fg={theme().textMuted}>
              {agent.displayName}
              <Show when={agent.laneId}> · {shortLane(agent.laneId)}</Show>
              <Show when={agent.issueId}> · {agent.issueId}</Show>
            </text>
          )}
        </For>
      </Show>
    </box>
  )
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
