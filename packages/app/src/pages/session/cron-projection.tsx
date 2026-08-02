import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createStore, reconcile } from "solid-js/store"
import { Bot, BookOpenText, Save, Terminal } from "lucide-solid"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import {
  apiCreateCronJob,
  apiDeleteCronJob,
  apiListCronJobs,
  apiListCronRuns,
  apiRunCronJob,
  apiUpdateCronJob,
  type CronAction,
  type CronInput,
  type CronJob,
  type CronRun,
} from "@/lib/cron/api"
import {
  RouteContent,
  RouteHeader,
  RouteNav,
  RoutePanel,
  ResizableSidebarLayout,
  ResizableSidebarPanel,
  RouteView,
} from "@/components/route"

type Form = CronInput & { id: string }

const presets = [
  { id: "daily-9", label: "Daily 9:00", schedule: "0 9 * * *" },
  { id: "weekday-9", label: "Weekdays 9:00", schedule: "0 9 * * 1-5" },
  { id: "hourly", label: "Hourly", schedule: "0 * * * *" },
  { id: "weekly-mon", label: "Monday 9:00", schedule: "0 9 * * 1" },
  { id: "custom", label: "Custom", schedule: "" },
]

function base(): Form {
  return {
    id: "",
    name: "Daily journal",
    schedule: "0 9 * * *",
    preset: "daily-9",
    action: "journal",
    enabled: true,
    command: "",
    cwd: "",
    env: "",
    prompt: "",
    agent: "",
    journalDir: "journal",
  }
}

function err(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function label(job: CronJob) {
  if (job.action === "journal") return "Journal"
  if (job.action === "agent") return "Agent"
  return "Shell"
}

function when(iso: string) {
  if (!iso) return "Never"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function icon(type: CronAction) {
  if (type === "journal") return <BookOpenText class="size-3.5" />
  if (type === "agent") return <Bot class="size-3.5" />
  return <Terminal class="size-3.5" />
}

type SidebarRoute = "jobs" | "runs" | "stats" | "config"
type Filter = "all" | "enabled" | "disabled" | "error" | CronAction
type Status = CronJob["lastStatus"] | CronRun["status"]

function chip(status: Status) {
  if (status === "ok") return "bg-surface-success/15 text-text-success"
  if (status === "error") return "bg-surface-danger/15 text-text-danger"
  if (status === "running") return "bg-surface-warning/15 text-text-warning"
  return "bg-subtle text-text-weaker"
}

function detail(job: CronJob) {
  if (job.action === "journal") return job.journalDir || "journal"
  if (job.action === "agent") return job.agent || "Default agent"
  return job.command || job.cwd || "Shell command"
}

function ms(value: number) {
  if (value < 1000) return `${value}ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`
}

export function CronProjection() {
  const sdk = useSDK()
  const mobile = createMediaQuery("(max-width: 767px)")
  const [jobs, setJobs] = createSignal<CronJob[]>([])
  const [busy, setBusy] = createSignal(false)
  const [form, setForm] = createStore<Form>(base())
  const [runs, setRuns] = createStore<Record<string, CronRun[]>>({})
  const [selectedJobId, setSelectedJobId] = createSignal<string | null>(null)
  const [sidebarRoute, setSidebarRoute] = createSignal<SidebarRoute>("jobs")
  const [filter, setFilter] = createSignal<Filter>("all")
  const [showCreate, setShowCreate] = createSignal(false)

  const load = async () => {
    setJobs(await apiListCronJobs(sdk.fetch, sdk.url, sdk.directory))
  }

  const guard = async (title: string, fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      showToast({ variant: "error", title, description: err(error) })
    } finally {
      setBusy(false)
    }
  }

  const reset = () => setForm(reconcile(base()))

  const edit = (job: CronJob) => {
    setForm(
      reconcile({
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        preset: job.preset || "custom",
        action: job.action,
        enabled: job.enabled,
        command: job.command,
        cwd: job.cwd,
        env: job.env,
        prompt: job.prompt,
        agent: job.agent,
        journalDir: job.journalDir,
      }),
    )
    setShowCreate(true)
  }

  const save = () =>
    guard("Failed to save cron job", async () => {
      const input = {
        name: form.name,
        schedule: form.schedule,
        action: form.action,
        preset: form.preset,
        enabled: form.enabled,
        command: form.command,
        cwd: form.cwd,
        env: form.env,
        prompt: form.prompt,
        agent: form.agent,
        journalDir: form.journalDir,
      }
      if (form.id) await apiUpdateCronJob(sdk.fetch, sdk.url, sdk.directory, form.id, input)
      else await apiCreateCronJob(sdk.fetch, sdk.url, sdk.directory, input)
      reset()
      setShowCreate(false)
      await load()
    })

  const toggle = (job: CronJob) =>
    guard("Failed to update cron job", async () => {
      await apiUpdateCronJob(sdk.fetch, sdk.url, sdk.directory, job.id, { enabled: !job.enabled })
      await load()
    })

  const remove = (job: CronJob) => {
    if (!window.confirm(`Delete ${job.name}?`)) return
    void guard("Failed to delete cron job", async () => {
      await apiDeleteCronJob(sdk.fetch, sdk.url, sdk.directory, job.id)
      if (selectedJobId() === job.id) setSelectedJobId(null)
      await load()
    })
  }

  const loadRuns = (job: CronJob) =>
    guard("Failed to load run history", async () => {
      setRuns(job.id, await apiListCronRuns(sdk.fetch, sdk.url, sdk.directory, job.id))
    })

  const run = (job: CronJob) =>
    guard("Failed to run cron job", async () => {
      const res = await apiRunCronJob(sdk.fetch, sdk.url, sdk.directory, job.id)
      await load()
      setRuns(job.id, await apiListCronRuns(sdk.fetch, sdk.url, sdk.directory, job.id))
      if (res?.status === "error") showToast({ variant: "error", title: "Cron run failed", description: res.error })
    })

  const sidebarRoutes = createMemo(() => [
    { id: "jobs" as SidebarRoute, label: "Jobs", icon: "list" },
    { id: "runs" as SidebarRoute, label: "Runs", icon: "clock" },
    { id: "stats" as SidebarRoute, label: "Stats", icon: "bar-chart" },
    { id: "config" as SidebarRoute, label: "Config", icon: "settings" },
  ])

  const filters = createMemo(() => [
    { id: "all" as Filter, label: "All", count: jobs().length },
    { id: "enabled" as Filter, label: "Enabled", count: jobs().filter((job) => job.enabled).length },
    { id: "disabled" as Filter, label: "Disabled", count: jobs().filter((job) => !job.enabled).length },
    { id: "error" as Filter, label: "Errors", count: jobs().filter((job) => job.lastStatus === "error").length },
    { id: "journal" as Filter, label: "Journal", count: jobs().filter((job) => job.action === "journal").length },
    { id: "agent" as Filter, label: "Agent", count: jobs().filter((job) => job.action === "agent").length },
    { id: "shell" as Filter, label: "Shell", count: jobs().filter((job) => job.action === "shell").length },
  ])

  const filtered = createMemo(() => {
    const active = filter()
    if (active === "all") return jobs()
    if (active === "enabled") return jobs().filter((job) => job.enabled)
    if (active === "disabled") return jobs().filter((job) => !job.enabled)
    if (active === "error") return jobs().filter((job) => job.lastStatus === "error")
    return jobs().filter((job) => job.action === active)
  })

  const selectedJob = createMemo(() => {
    const id = selectedJobId()
    if (!id) return null
    return jobs().find((j) => j.id === id) ?? null
  })

  const stats = createMemo(() => {
    const total = jobs().length
    const enabled = jobs().filter((j) => j.enabled).length
    const ok = jobs().filter((j) => j.lastStatus === "ok").length
    const error = jobs().filter((j) => j.lastStatus === "error").length
    return { total, enabled, ok, error }
  })

  onMount(() => {
    void load()
    const id = window.setInterval(() => void load(), 10_000)
    onCleanup(() => window.clearInterval(id))
  })

  return (
    <RouteView>
      <ResizableSidebarLayout id="cron" defaultWidth={280} disabled={mobile()}>
        <RoutePanel compact={mobile()}>
          <Show when={!mobile()}>
            <ResizableSidebarPanel>
              {() => (
                <div class="flex h-full flex-col">
                  <div class="border-b border-border-base p-3">
                    <h2 class="text-13-medium text-text-strong">Cron</h2>
                  </div>
                  <div class="flex-1 overflow-y-auto p-2">
                    <RouteNav
                      items={sidebarRoutes().map((route) => ({
                        id: route.id,
                        label: route.label,
                        icon: <Icon name={route.icon} size="small" />,
                      }))}
                      active={sidebarRoute()}
                      onSelect={(id) => setSidebarRoute(id as SidebarRoute)}
                    />
                    <Show when={sidebarRoute() === "jobs"}>
                      <div class="mt-3 border-t border-border-weaker-base pt-3">
                        <div class="px-2 pb-1 text-10-medium uppercase tracking-wide text-text-weaker">Filter</div>
                        <div class="flex flex-col gap-0.5">
                          <For each={filters()}>
                            {(item) => (
                              <button
                                type="button"
                                class={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-12-regular transition-colors ${
                                  filter() === item.id
                                    ? "bg-subtle text-text-strong"
                                    : "text-text-base hover:bg-subtle"
                                }`}
                                onClick={() => setFilter(item.id)}
                              >
                                <span>{item.label}</span>
                                <span class="text-10-regular tabular-nums text-text-weaker">{item.count}</span>
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </ResizableSidebarPanel>
          </Show>
          <div class="route-main flex min-h-0 flex-1 flex-col">
            <RouteHeader
              title={sidebarRoutes().find((r) => r.id === sidebarRoute())?.label}
              meta={
                sidebarRoute() === "jobs"
                  ? `${filtered().length}/${stats().total} jobs · ${stats().enabled} enabled · ${stats().ok} ok · ${stats().error} error`
                  : `${stats().total} jobs · ${stats().enabled} enabled · ${stats().ok} ok · ${stats().error} error`
              }
              actions={
                <Show when={sidebarRoute() === "jobs"}>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      reset()
                      setShowCreate(true)
                    }}
                    disabled={busy()}
                  >
                    <Icon name="plus" size="small" class="mr-1" />
                    New Job
                  </Button>
                </Show>
              }
            />
            <Show when={mobile()}>
              <RouteNav
                variant="tabs"
                items={sidebarRoutes().map((route) => ({
                  id: route.id,
                  label: route.label,
                  icon: <Icon name={route.icon} size="small" />,
                }))}
                active={sidebarRoute()}
                onSelect={(id) => setSidebarRoute(id as SidebarRoute)}
              />
            </Show>
            <RouteContent scroll={false}>
              <div class="flex h-full min-h-0 flex-col">
                <Show when={sidebarRoute() === "jobs"}>
                  <JobsTab
                    jobs={filtered()}
                    empty={jobs().length > 0 ? "No jobs match this filter" : "No cron jobs configured"}
                    selectedJob={selectedJob()}
                    onSelectJob={setSelectedJobId}
                    onEdit={edit}
                    onToggle={toggle}
                    onRun={run}
                    onDelete={remove}
                    busy={busy}
                  />
                </Show>
                <Show when={sidebarRoute() === "runs"}>
                  <RunsTab
                    jobs={jobs()}
                    selectedJob={selectedJob()}
                    runs={runs}
                    onSelectJob={setSelectedJobId}
                    onLoadRuns={loadRuns}
                    busy={busy}
                  />
                </Show>
                <Show when={sidebarRoute() === "stats"}>
                  <StatsTab stats={stats()} />
                </Show>
                <Show when={sidebarRoute() === "config"}>
                  <ConfigTab />
                </Show>
              </div>
            </RouteContent>
          </div>
        </RoutePanel>
      </ResizableSidebarLayout>
      <Show when={showCreate()}>
        <CreateJobDialog
          form={form}
          setForm={setForm}
          onSave={save}
          onCancel={() => {
            reset()
            setShowCreate(false)
          }}
          busy={busy}
        />
      </Show>
    </RouteView>
  )
}

function JobsTab(props: {
  jobs: CronJob[]
  empty: string
  selectedJob: CronJob | null
  onSelectJob: (id: string | null) => void
  onEdit: (job: CronJob) => void
  onToggle: (job: CronJob) => void
  onRun: (job: CronJob) => void
  onDelete: (job: CronJob) => void
  busy: () => boolean
}) {
  return (
    <div data-ui-pattern="layout.well" class="flex h-full min-h-0 flex-col bg-well">
      <Show
        when={props.jobs.length > 0}
        fallback={
          <div class="flex h-full items-center justify-center text-12-regular text-text-weaker">
            {props.empty}
          </div>
        }
      >
        <div class="h-full overflow-auto">
          <div>
            <div class="sticky top-0 z-10 hidden border-b border-border-weaker-base bg-elevated text-10-medium uppercase tracking-wide text-text-weaker sm:grid sm:grid-cols-[minmax(8.5rem,1.5fr)_4.25rem_4.5rem_minmax(4.5rem,0.7fr)_minmax(6.5rem,1fr)_6.75rem]">
              <div class="px-3 py-2 font-medium">Job</div>
              <div class="px-3 py-2 font-medium">State</div>
              <div class="px-3 py-2 font-medium">Action</div>
              <div class="px-3 py-2 font-medium">Schedule</div>
              <div class="px-3 py-2 font-medium">Next Run</div>
              <div class="px-1 py-2 text-right font-medium">Actions</div>
            </div>
            <div class="text-12-regular">
              <For each={props.jobs}>
                {(job) => (
                  <div
                    class={`mx-2 my-2 flex flex-col gap-2 rounded-md border border-border-weaker-base/60 px-3 py-3 transition-colors hover:bg-subtle sm:m-0 sm:grid sm:min-h-14 sm:grid-cols-[minmax(8.5rem,1.5fr)_4.25rem_4.5rem_minmax(4.5rem,0.7fr)_minmax(6.5rem,1fr)_6.75rem] sm:items-center sm:gap-0 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:px-0 sm:py-0 ${
                      props.selectedJob?.id === job.id ? "bg-elevated" : "bg-well"
                    }`}
                    onClick={() => props.onSelectJob(job.id)}
                  >
                    <div class="flex min-w-0 items-center gap-2 sm:px-3 sm:py-2">
                      <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-subtle text-text-base">
                        {icon(job.action)}
                      </span>
                      <div class="min-w-0">
                        <div class="truncate text-12-medium text-text-strong">{job.name}</div>
                        <Show
                          when={job.lastError}
                          fallback={
                            <div class="truncate text-11-regular text-text-weaker">
                              {detail(job)} · Last {when(job.lastRunAt)}
                            </div>
                          }
                        >
                          {(error) => <div class="truncate text-11-regular text-text-danger">{error()}</div>}
                        </Show>
                      </div>
                    </div>
                    <div class="flex items-center justify-between gap-2 sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">State</span>
                      <div class="flex items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
                        <span class={`rounded-full px-2 py-0.5 text-11-medium ${chip(job.lastStatus)}`}>
                          {job.lastStatus}
                        </span>
                        <span class={`text-10-regular ${job.enabled ? "text-text-success" : "text-text-weaker"}`}>
                          {job.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                    <div class="flex items-center justify-between gap-2 text-text-base sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">Action</span>
                      <span>{label(job)}</span>
                    </div>
                    <div class="flex min-w-0 items-center justify-between gap-2 font-mono text-text-base sm:block sm:px-3 sm:py-2">
                      <span class="font-sans text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">
                        Schedule
                      </span>
                      <span class="block truncate whitespace-nowrap">{job.schedule}</span>
                    </div>
                    <div class="flex min-w-0 items-center justify-between gap-2 text-text-weaker sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">Next</span>
                      <span class="block truncate whitespace-nowrap">{when(job.nextRunAt)}</span>
                    </div>
                    <div class="flex items-center justify-end gap-0.5 sm:px-1 sm:py-2">
                      <IconButton
                        icon="power"
                        size="small"
                        title={job.enabled ? "Disable job" : "Enable job"}
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onToggle(job)
                        }}
                        disabled={props.busy()}
                      />
                      <IconButton
                        icon="play"
                        size="small"
                        title="Run now"
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onRun(job)
                        }}
                        disabled={props.busy()}
                      />
                      <IconButton
                        icon="pencil"
                        size="small"
                        title="Edit job"
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onEdit(job)
                        }}
                        disabled={props.busy()}
                      />
                      <IconButton
                        icon="trash"
                        size="small"
                        title="Delete job"
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onDelete(job)
                        }}
                        disabled={props.busy()}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

function RunsTab(props: {
  jobs: CronJob[]
  selectedJob: CronJob | null
  runs: Record<string, CronRun[]>
  onSelectJob: (id: string | null) => void
  onLoadRuns: (job: CronJob) => void
  busy: () => boolean
}) {
  const job = () => props.selectedJob ?? props.jobs[0]
  const jobRuns = () => props.runs[job()?.id ?? ""] ?? []

  createEffect(() => {
    const item = job()
    if (!item || props.runs[item.id] !== undefined) return
    props.onLoadRuns(item)
  })

  return (
    <div data-ui-pattern="layout.well" class="flex h-full min-h-0 flex-col bg-well">
      <div class="flex shrink-0 flex-col gap-2 border-b border-border-weaker-base bg-elevated px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <Show when={props.jobs.length > 0} fallback={<div class="text-12-regular text-text-weaker">No jobs</div>}>
          <select
            class="min-w-0 rounded-md border border-border-base bg-well px-2 py-1.5 text-12-regular text-text-strong outline-none focus:border-border-strong-base sm:w-72"
            value={job()?.id}
            onChange={(event) => props.onSelectJob(event.currentTarget.value || null)}
          >
            <For each={props.jobs}>{(item) => <option value={item.id}>{item.name}</option>}</For>
          </select>
        </Show>
        <Show when={job()}>
          {(item) => (
            <Button size="small" variant="secondary" onClick={() => props.onLoadRuns(item())} disabled={props.busy()}>
              <Icon name="refresh" size="small" class="mr-1" />
              Refresh
            </Button>
          )}
        </Show>
      </div>
      <Show
        when={jobRuns().length > 0}
        fallback={
          <div class="flex h-full items-center justify-center text-12-regular text-text-weaker">No runs yet</div>
        }
      >
        <div class="h-full overflow-auto">
          <div>
            <div class="sticky top-0 z-10 hidden border-b border-border-weaker-base bg-elevated text-10-medium uppercase tracking-wide text-text-weaker sm:grid sm:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem_minmax(10rem,1.2fr)]">
              <div class="px-3 py-2 font-medium">Ran At</div>
              <div class="px-3 py-2 font-medium">Status</div>
              <div class="px-3 py-2 font-medium">Duration</div>
              <div class="px-3 py-2 font-medium">Output</div>
            </div>
            <div class="text-12-regular">
              <For each={jobRuns()}>
                {(run) => (
                  <div class="mx-2 my-2 flex flex-col gap-2 rounded-md border border-border-weaker-base/60 bg-well px-3 py-3 transition-colors hover:bg-subtle sm:m-0 sm:grid sm:min-h-12 sm:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem_minmax(10rem,1.2fr)] sm:items-center sm:gap-0 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:px-0 sm:py-0">
                    <div class="flex items-center justify-between gap-2 text-text-base sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">Ran At</span>
                      <span>{when(run.ranAt)}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2 sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">Status</span>
                      <span class={`rounded-full px-2 py-0.5 text-11-medium ${chip(run.status)}`}>{run.status}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2 text-text-weaker sm:block sm:px-3 sm:py-2">
                      <span class="text-10-medium uppercase tracking-wide text-text-weaker sm:hidden">Duration</span>
                      <span class="font-mono">{ms(run.durationMs)}</span>
                    </div>
                    <div class="min-w-0 text-text-weaker sm:px-3 sm:py-2">
                      <Show when={run.error || run.output} fallback={<span class="text-text-weaker">-</span>}>
                        {(out) => <div class="truncate font-mono text-11-regular text-text-weaker">{out()}</div>}
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

function StatsTab(props: { stats: { total: number; enabled: number; ok: number; error: number } }) {
  return (
    <div class="h-full overflow-y-auto p-4">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <div class="text-11-medium uppercase tracking-wide text-text-weaker">Total Jobs</div>
          <div class="mt-2 text-2xl-medium text-text-strong">{props.stats.total}</div>
        </div>
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <div class="text-11-medium uppercase tracking-wide text-text-weaker">Enabled</div>
          <div class="mt-2 text-2xl-medium text-text-success">{props.stats.enabled}</div>
        </div>
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <div class="text-11-medium uppercase tracking-wide text-text-weaker">Success Rate</div>
          <div class="mt-2 text-2xl-medium text-text-strong">
            {props.stats.total > 0 ? Math.round((props.stats.ok / props.stats.total) * 100) : 0}%
          </div>
        </div>
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <div class="text-11-medium uppercase tracking-wide text-text-weaker">Failed</div>
          <div class="mt-2 text-2xl-medium text-text-danger">{props.stats.error}</div>
        </div>
      </div>
    </div>
  )
}

function ConfigTab() {
  return (
    <div class="h-full overflow-y-auto p-4">
      <div class="space-y-4">
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <h3 class="text-13-medium text-text-strong">Scheduler Settings</h3>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-11-medium uppercase tracking-wide text-text-weaker">Tick Interval</label>
              <div class="mt-1 text-12-regular text-text-base">30 seconds</div>
            </div>
            <div>
              <label class="text-11-medium uppercase tracking-wide text-text-weaker">Run Retention</label>
              <div class="mt-1 text-12-regular text-text-base">50 runs per job</div>
            </div>
            <div>
              <label class="text-11-medium uppercase tracking-wide text-text-weaker">Output Limit</label>
              <div class="mt-1 text-12-regular text-text-base">4000 characters</div>
            </div>
            <div>
              <label class="text-11-medium uppercase tracking-wide text-text-weaker">Timeout</label>
              <div class="mt-1 text-12-regular text-text-base">2 minutes</div>
            </div>
          </div>
        </div>
        <div class="rounded-md border border-border-weaker-base bg-subtle p-4">
          <h3 class="text-13-medium text-text-strong">Note</h3>
          <p class="mt-2 text-12-regular text-text-weaker">
            Cron jobs run only while the IDE/server is open. Missed schedules catch up at most once on boot.
          </p>
        </div>
      </div>
    </div>
  )
}

function CreateJobDialog(props: {
  form: Form
  setForm: (form: Form) => void
  onSave: () => void
  onCancel: () => void
  busy: () => boolean
}) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-base bg-surface-raised-base p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-15-medium text-text-strong">{props.form.id ? "Edit Job" : "Create Job"}</h2>
          <IconButton icon="x" size="small" onClick={props.onCancel} />
        </div>
        <div class="mt-4 space-y-4">
          <div class="grid gap-3 lg:grid-cols-[1fr_160px_180px]">
            <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
              Name
              <input
                class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                value={props.form.name}
                onInput={(e) => props.setForm({ ...props.form, name: e.currentTarget.value })}
              />
            </label>
            <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
              Type
              <select
                class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                value={props.form.action}
                onChange={(e) => props.setForm({ ...props.form, action: e.currentTarget.value as CronAction })}
              >
                <option value="journal">Journal</option>
                <option value="shell">Shell</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            <label class="flex items-end gap-2 text-12-regular text-text-base">
              <input
                type="checkbox"
                checked={props.form.enabled}
                onChange={(e) => props.setForm({ ...props.form, enabled: e.currentTarget.checked })}
              />
              Enabled
            </label>
          </div>
          <div class="grid gap-3 lg:grid-cols-[180px_1fr]">
            <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
              Preset
              <select
                class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                value={props.form.preset}
                onChange={(e) => {
                  const item = presets.find((preset) => preset.id === e.currentTarget.value)
                  props.setForm({ ...props.form, preset: e.currentTarget.value })
                  if (item?.schedule) props.setForm({ ...props.form, schedule: item.schedule })
                }}
              >
                <For each={presets}>{(preset) => <option value={preset.id}>{preset.label}</option>}</For>
              </select>
            </label>
            <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
              Cron
              <input
                class="rounded-md border border-border-base bg-well px-2 py-1.5 font-mono text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                value={props.form.schedule}
                onInput={(e) => {
                  props.setForm({ ...props.form, schedule: e.currentTarget.value })
                  props.setForm({
                    ...props.form,
                    preset: presets.find((preset) => preset.schedule === e.currentTarget.value)?.id ?? "custom",
                  })
                }}
              />
            </label>
          </div>
          <Show when={props.form.action === "journal"}>
            <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
              Journal directory
              <input
                class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                value={props.form.journalDir}
                onInput={(e) => props.setForm({ ...props.form, journalDir: e.currentTarget.value })}
              />
            </label>
          </Show>
          <Show when={props.form.action === "shell"}>
            <div class="grid gap-3">
              <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
                Command
                <textarea
                  class="min-h-20 rounded-md border border-border-base bg-well px-2 py-1.5 font-mono text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                  value={props.form.command}
                  onInput={(e) => props.setForm({ ...props.form, command: e.currentTarget.value })}
                />
              </label>
              <div class="grid gap-3 lg:grid-cols-2">
                <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
                  Working directory
                  <input
                    class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                    value={props.form.cwd}
                    onInput={(e) => props.setForm({ ...props.form, cwd: e.currentTarget.value })}
                  />
                </label>
                <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
                  Env JSON
                  <input
                    class="rounded-md border border-border-base bg-well px-2 py-1.5 font-mono text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                    value={props.form.env}
                    onInput={(e) => props.setForm({ ...props.form, env: e.currentTarget.value })}
                  />
                </label>
              </div>
            </div>
          </Show>
          <Show when={props.form.action === "agent"}>
            <div class="grid gap-3">
              <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
                Agent
                <input
                  class="rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                  value={props.form.agent}
                  onInput={(e) => props.setForm({ ...props.form, agent: e.currentTarget.value })}
                />
              </label>
              <label class="grid gap-1 text-11-medium uppercase tracking-wide text-text-weaker">
                Prompt
                <textarea
                  class="min-h-24 rounded-md border border-border-base bg-well px-2 py-1.5 text-13-regular text-text-strong outline-none focus:border-border-strong-base"
                  value={props.form.prompt}
                  onInput={(e) => props.setForm({ ...props.form, prompt: e.currentTarget.value })}
                />
              </label>
            </div>
          </Show>
        </div>
        <div class="mt-6 flex items-center justify-end gap-2">
          <Button size="small" variant="ghost" onClick={props.onCancel} disabled={props.busy()}>
            Cancel
          </Button>
          <Button size="small" variant="primary" onClick={props.onSave} disabled={props.busy()}>
            <Save class="mr-1 size-3.5" />
            {props.form.id ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}
