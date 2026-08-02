import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
  useContext,
  type ParentProps,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "@/context/sdk"
import { useTrellis, type WorkUnit } from "@/context/trellis"
import { useTrellisStore } from "@/context/trellis-store"
import { EntityIcon, entityColor } from "@/lib/entity-theme"
import { MetaField, Pill, SectionHeader, TagChip } from "@/components/affordance"
import { EntityActivity, EntitySurface, EntitySurfaceSidebar } from "@/components/entity-detail"
import { resolveSubtitle, resolveTitle } from "@/components/entity-detail/adapters"
import { autoNoteTitle, noteFromFacts } from "@/lib/projections/notes-model"
import { apiDeleteNote, apiSaveNote } from "@/lib/projections/notes-api"
import { NoteEditor } from "@/pages/session/note-editor"
import { NoteTags } from "@/pages/session/note-tags"
import {
  createEntityDialogStack,
  EntityDialogStackCard,
  EntityDialogStackHost,
  type EntityDialogEntry,
  type EntityDialogMode,
  type EntityDialogStackApi,
} from "@/components/entity-dialog-stack"

const base = { w: 760, h: 620 }

type Push = {
  mode?: EntityDialogMode
  draft?: unknown
}

type Ctx = Omit<EntityDialogStackApi, "push"> & {
  trellis: ReturnType<typeof useTrellis>
  sdk: ReturnType<typeof useSDK>
  push: (id: string, type?: string, opts?: Push) => void
}

const Context = createContext<Ctx>()

function kind(id: string, type?: string) {
  if (type) return type
  if (!id.includes(":")) return "entity"
  return id.split(":")[0] || "entity"
}

function full(id: string, type?: string) {
  if (id.includes(":")) return id
  if (type === "issue") return `issue:${id}`
  return id
}

function short(id: string) {
  if (!id.includes(":")) return id
  return id.split(":").slice(1).join(":")
}

function ago(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function EntityDialogProvider(props: ParentProps) {
  const dialog = useDialog()
  const trellis = useTrellis()
  const sdk = useSDK()
  const stack = createEntityDialogStack({ base })

  const api: Ctx = {
    stack: stack.api.stack,
    size: stack.api.size,
    pop: stack.api.pop,
    clear: stack.api.clear,
    reset: stack.api.reset,
    setSize: stack.api.setSize,
    getTransform: stack.api.getTransform,
    trellis,
    sdk,
    push(id, type, opts) {
      const next = full(id, type)
      stack.api.push({
        id: next,
        type: kind(next, type),
        mode: opts?.mode,
        draft: opts?.draft,
      })
    },
  }

  stack.mount(dialog, () => (
    <Context.Provider value={api}>
      <EntityDialogHost />
    </Context.Provider>
  ))

  return <Context.Provider value={api}>{props.children}</Context.Provider>
}

export function useEntityDialog() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useEntityDialog must be used within EntityDialogProvider")
  return ctx
}

function EntityDialogHost() {
  const dialog = useEntityDialog()

  return (
    <EntityDialogStackHost
      stack={dialog.stack}
      render={(entry, index) => <EntityCard entry={entry} index={index()} />}
    />
  )
}

function EntityCard(props: { entry: EntityDialogEntry; index: number }) {
  const dialog = useEntityDialog()
  const store = useTrellisStore()
  const transform = createMemo(() => dialog.getTransform(props.index))
  const top = createMemo(() => props.index === dialog.stack().length - 1)
  const prev = createMemo(() => dialog.stack()[props.index - 1])
  const isNote = () => props.entry.type === "note"
  const label = createMemo(() => {
    if (isNote()) return noteFromFacts(props.entry.id, store.facts).title
    return short(props.entry.id)
  })

  return (
    <EntityDialogStackCard index={props.index} transform={transform()}>
      <div class="shrink-0 border-b border-border-weaker-base px-4 py-3 flex items-center gap-3">
        <Show when={props.index > 0}>
          <button
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-weak hover:text-text-base hover:bg-surface-raised-base/60 transition-colors"
            onClick={() => dialog.pop()}
          >
            <Icon name="arrow-left" size="small" />
            <span class="truncate max-w-40">{prev() ? short(prev()!.id) : "Back"}</span>
          </button>
        </Show>
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1 rounded-full bg-surface-raised-base px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: entityColor(props.entry.type) }}
          >
            <EntityIcon type={props.entry.type} size={12} />
            {props.entry.type}
          </span>
          <span class="truncate text-12-medium text-text-strong" classList={{ "font-mono": !isNote() }}>
            {label()}
          </span>
        </div>
        <Show when={top()}>
          <IconButton icon="close-small" variant="ghost" onClick={() => dialog.clear()} />
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <Switch fallback={<GenericContent id={props.entry.id} type={props.entry.type} />}>
          <Match when={props.entry.type === "issue"}>
            <IssueContent id={props.entry.id} />
          </Match>
          <Match when={props.entry.type === "workunit"}>
            <WorkUnitContent id={props.entry.id} />
          </Match>
          <Match when={props.entry.type === "note"}>
            <NoteContent id={props.entry.id} />
          </Match>
        </Switch>
      </div>
    </EntityDialogStackCard>
  )
}

function EntitySidebar(props: { entityId: string; type: string }) {
  return <EntitySurfaceSidebar id={props.entityId} type={props.type} />
}

function IssueContent(props: { id: string }) {
  const dialog = useEntityDialog()
  const trellis = dialog.trellis
  const [state, setState] = createStore({
    busy: false,
    adding: false,
    newAcDesc: "",
    newAcCmd: "",
    assigning: false,
    assignee: "",
  })
  const id = createMemo(() => props.id.replace(/^issue:/, ""))
  const [detail, ctrl] = createResource(id, (next) => trellis.getIssue(next), { initialValue: undefined })
  const [traces] = createResource(id, (next) => trellis.fetchDecisionChain(`issue:${next}`), { initialValue: [] })
  const issue = () => detail.latest
  const trace = () => traces.latest ?? []

  const act = async (run: () => Promise<unknown>) => {
    setState("busy", true)
    try {
      await run()
      await trellis.refresh()
      void ctrl.refetch()
    } catch (err) {
      console.error("[entity-dialog] action failed:", err)
    } finally {
      setState("busy", false)
    }
  }

  const actions = createMemo(() => {
    const current = issue()
    if (!current) return [] as Array<{ label: string; run: () => void }>
    const out: Array<{ label: string; run: () => void }> = []
    if (current.status === "backlog")
      out.push({ label: "Triage", run: () => void act(() => trellis.triageIssue(id())) })
    if (current.status === "backlog" || current.status === "queue") {
      out.push({ label: "Start", run: () => void act(() => trellis.startIssue(id())) })
    }
    if (current.status === "in_progress")
      out.push({ label: "Pause", run: () => void act(() => trellis.pauseIssue(id())) })
    if (current.status === "paused") out.push({ label: "Resume", run: () => void act(() => trellis.resumeIssue(id())) })
    if (current.status === "in_progress" || current.status === "paused") {
      out.push({ label: "Close", run: () => void act(() => trellis.closeIssue(id(), true)) })
    }
    if (current.status === "closed") out.push({ label: "Reopen", run: () => void act(() => trellis.reopenIssue(id())) })
    return out
  })

  const submitCriterion = async () => {
    const desc = state.newAcDesc.trim()
    if (!desc) return
    await act(() => trellis.addCriterion(id(), desc, state.newAcCmd.trim() || undefined))
    batch(() => {
      setState("newAcDesc", "")
      setState("newAcCmd", "")
      setState("adding", false)
    })
  }

  const submitAssignee = async () => {
    const agent = state.assignee.trim()
    if (!agent) return
    await act(() => trellis.assignIssue(id(), agent))
    batch(() => {
      setState("assignee", "")
      setState("assigning", false)
    })
  }

  return (
    <div class="flex h-full">
      <div class="flex-1 min-h-0 overflow-auto p-4">
        <Show
          when={!detail.loading}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <Spinner />
              <div class="text-12-regular">Loading details...</div>
            </div>
          }
        >
          <Show when={issue()} fallback={<GenericContent id={props.id} type="issue" />}>
            {(issue) => (
              <div class="flex flex-col gap-4">
                <div class="flex items-center gap-2">
                  <span class="text-12-medium text-text-info">{issue().id}</span>
                  <Pill>{issue().priority}</Pill>
                  <Pill>{issue().status}</Pill>
                </div>

                <h1 class="text-16-semibold text-text-strong leading-tight">{issue().title}</h1>

                <Show when={issue().description}>
                  <div class="text-13-regular text-text-base whitespace-pre-wrap">{issue().description}</div>
                </Show>

                <Show when={issue().labels.length > 0}>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={issue().labels}>{(label) => <TagChip>{label}</TagChip>}</For>
                  </div>
                </Show>

                <Show when={actions().length > 0}>
                  <div class="flex items-center gap-2 flex-wrap">
                    <For each={actions()}>
                      {(item) => (
                        <Button size="small" variant="ghost" onClick={item.run} disabled={state.busy}>
                          {item.label}
                        </Button>
                      )}
                    </For>
                    <Show when={!state.assigning}>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => setState("assigning", true)}
                        disabled={state.busy}
                      >
                        Assign
                      </Button>
                    </Show>
                  </div>
                </Show>

                <Show when={state.assigning}>
                  <div class="flex items-center gap-2 p-2 rounded-md bg-background-base border border-border-base">
                    <InlineInput
                      placeholder="Agent ID..."
                      value={state.assignee}
                      onInput={(e: InputEvent) => setState("assignee", (e.target as HTMLInputElement).value)}
                      onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && void submitAssignee()}
                      class="flex-1"
                      autofocus
                    />
                    <IconButton
                      icon="check-small"
                      variant="ghost"
                      onClick={() => void submitAssignee()}
                      disabled={!state.assignee.trim()}
                    />
                    <IconButton icon="close-small" variant="ghost" onClick={() => setState("assigning", false)} />
                  </div>
                </Show>

                <div class="flex flex-col gap-3">
                  <SectionHeader
                    label="Acceptance Criteria"
                    trailing={
                      <div class="flex items-center gap-1">
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={() => setState("adding", true)}
                          disabled={state.adding}
                        >
                          Add
                        </Button>
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={() =>
                            void act(async () => {
                              await trellis.runCriteria(id())
                            })
                          }
                          disabled={state.busy}
                        >
                          Run All
                        </Button>
                      </div>
                    }
                  />
                  <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                    <For
                      each={issue().criteria}
                      fallback={<div class="text-12-regular text-text-weaker italic">No criteria defined</div>}
                    >
                      {(item, index) => (
                        <div class="p-3 rounded-md bg-background-base border border-border-base flex flex-col gap-2">
                          <div class="flex items-start gap-3">
                            <button
                              class="mt-1 shrink-0 cursor-pointer hover:opacity-70 transition-opacity"
                              title="Click to toggle status"
                              onClick={() => {
                                const next =
                                  item.status === "passed" ? "failed" : item.status === "failed" ? "pending" : "passed"
                                void act(() => trellis.setCriterionStatus(id(), index(), next))
                              }}
                              disabled={state.busy}
                            >
                              <Show
                                when={item.status === "passed"}
                                fallback={
                                  <Show
                                    when={item.status === "failed"}
                                    fallback={<div class="size-3 rounded-full border-2 border-border-strong-base" />}
                                  >
                                    <Icon name="close-small" size="small" class="text-icon-error" />
                                  </Show>
                                }
                              >
                                <Icon name="checklist" size="small" class="text-icon-success" />
                              </Show>
                            </button>
                            <div class="flex-1 min-w-0">
                              <div class="text-13-medium text-text-strong leading-normal">{item.description}</div>
                              <Show when={item.command}>
                                <code class="text-11-mono text-text-weak block mt-1 p-1 rounded bg-surface-raised-base truncate">
                                  {item.command}
                                </code>
                              </Show>
                            </div>
                          </div>
                          <Show when={item.lastOutput}>
                            <pre class="mt-1 p-2 rounded bg-background-stronger text-11-mono text-text-weak overflow-x-auto max-h-24">
                              {item.lastOutput}
                            </pre>
                          </Show>
                        </div>
                      )}
                    </For>

                    <Show when={state.adding}>
                      <div class="p-3 rounded-md bg-background-base border border-border-base flex flex-col gap-2">
                        <InlineInput
                          placeholder="Criterion description..."
                          value={state.newAcDesc}
                          onInput={(e: InputEvent) => setState("newAcDesc", (e.target as HTMLInputElement).value)}
                          onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && void submitCriterion()}
                          class="w-full"
                          autofocus
                        />
                        <div class="flex items-center gap-2">
                          <InlineInput
                            placeholder="Command (optional)..."
                            value={state.newAcCmd}
                            onInput={(e: InputEvent) => setState("newAcCmd", (e.target as HTMLInputElement).value)}
                            onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && void submitCriterion()}
                            class="flex-1"
                          />
                          <IconButton
                            icon="check-small"
                            variant="ghost"
                            onClick={() => void submitCriterion()}
                            disabled={!state.newAcDesc.trim()}
                          />
                          <IconButton
                            icon="close-small"
                            variant="ghost"
                            onClick={() => {
                              batch(() => {
                                setState("adding", false)
                                setState("newAcDesc", "")
                                setState("newAcCmd", "")
                              })
                            }}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>

                <Show when={trace().length > 0}>
                  <div class="flex flex-col gap-3">
                    <SectionHeader label="Decision Traces" icon="brain" />
                    <div class="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                      <For each={trace()}>
                        {(item) => (
                          <div class="p-2 rounded-md bg-background-base border border-border-base flex items-start gap-2">
                            <Icon name="brain" size="small" class="mt-0.5 shrink-0 text-icon-weak" />
                            <div class="flex-1 min-w-0">
                              <div class="text-12-medium text-text-strong">{item.toolName}</div>
                              <Show when={item.outputSummary}>
                                <div class="text-11-regular text-text-weak truncate">{item.outputSummary}</div>
                              </Show>
                            </div>
                            <div class="shrink-0 text-11-regular text-text-weaker whitespace-nowrap">
                              {ago(item.timestamp)}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <div class="pt-4 border-t border-border-weaker-base flex flex-col gap-3 text-12-regular text-text-weak">
                  <div class="flex justify-between">
                    <span>Created</span>
                    <span>{issue().createdAt}</span>
                  </div>
                  <Show when={issue().assignee}>
                    <div class="flex justify-between">
                      <span>Assignee</span>
                      <span>{issue().assignee}</span>
                    </div>
                  </Show>
                  <Show when={issue().branch}>
                    <div class="flex justify-between">
                      <span>Branch</span>
                      <span class="text-11-mono">{issue().branch}</span>
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </div>
      <EntitySidebar entityId={`issue:${id()}`} type="issue" />
    </div>
  )
}

function WorkUnitContent(props: { id: string }) {
  const dialog = useEntityDialog()
  const trellis = dialog.trellis
  const id = createMemo(() => props.id.replace(/^workunit:/, ""))
  const unit = createMemo(() => trellis.workUnits.find((item) => item.id === id()))
  const pct = createMemo(() => {
    const item = unit()
    if (!item?.criteriaCount) return 0
    return Math.round((item.criteriaPassed / item.criteriaCount) * 100)
  })
  const states: Array<{ id: WorkUnit["status"]; label: string }> = [
    { id: "backlog", label: "Backlog" },
    { id: "in_progress", label: "In Progress" },
    { id: "done", label: "Done" },
  ]
  const set = (status: WorkUnit["status"]) => {
    if (unit()?.status === status) return
    void trellis.updateWorkUnit(id(), { status })
  }

  return (
    <Show
      when={unit()}
      fallback={
        <div class="flex h-full items-center justify-center text-12-regular text-text-weak">WorkUnit not found</div>
      }
    >
      {(unit) => (
        <div class="flex h-full min-h-0">
          <div class="flex-1 min-w-0 overflow-y-auto p-5">
            <div class="flex flex-col gap-5">
              <div class="flex items-start gap-3">
                <EntityIcon type="workunit" size={18} class="mt-1 shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-11-medium uppercase tracking-wide text-text-weak">WorkUnit</div>
                  <h1 class="mt-1 text-18-semibold text-text-strong leading-snug">{unit().title}</h1>
                  <div class="mt-2 flex items-center gap-2 flex-wrap">
                    <span class="text-11-mono text-text-info">{unit().id}</span>
                    <Pill>{unit().priority}</Pill>
                    <Pill>{unit().status}</Pill>
                  </div>
                </div>
              </div>

              <Show when={unit().tags.length > 0}>
                <section class="flex flex-col gap-2">
                  <SectionHeader label="Labels" />
                  <div class="flex flex-wrap gap-1.5">
                    <For each={unit().tags}>{(tag) => <TagChip>{tag}</TagChip>}</For>
                  </div>
                </section>
              </Show>

              <section class="flex flex-col gap-2">
                <SectionHeader label="Description" icon="align-left" />
                <div class="rounded-md border border-border-base bg-background-base px-3 py-2 text-13-regular text-text-base">
                  {unit().title}
                </div>
              </section>

              <section class="flex flex-col gap-3">
                <SectionHeader
                  label="Acceptance Criteria"
                  icon="checklist"
                  trailing={<span class="text-11-regular text-text-weaker">{pct()}%</span>}
                />
                <div class="h-1.5 rounded-full bg-surface-raised-base overflow-hidden">
                  <div class="h-full bg-text-success transition-all" style={{ width: `${pct()}%` }} />
                </div>
                <For
                  each={unit().criteria}
                  fallback={<div class="text-12-regular text-text-weaker italic">No criteria defined</div>}
                >
                  {(item) => (
                    <div class="rounded-md border border-border-base bg-background-base p-3 flex items-start gap-3">
                      <Show
                        when={item.status === "passed"}
                        fallback={
                          <Show
                            when={item.status === "failed"}
                            fallback={<div class="mt-0.5 size-4 rounded-sm border border-border-strong-base" />}
                          >
                            <Icon name="close-small" size="small" class="mt-0.5 shrink-0 text-icon-error" />
                          </Show>
                        }
                      >
                        <Icon name="check-small" size="small" class="mt-0.5 shrink-0 text-icon-success" />
                      </Show>
                      <div class="flex-1 min-w-0">
                        <div class="text-13-medium text-text-strong leading-normal">{item.description}</div>
                        <Show when={item.command}>
                          <code class="mt-1 block truncate rounded bg-surface-raised-base px-1.5 py-1 text-11-mono text-text-weak">
                            {item.command}
                          </code>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </section>
            </div>
          </div>

          <aside class="w-80 shrink-0 border-l border-border-weaker-base bg-surface-raised-base/30 flex flex-col min-h-0">
            <div class="shrink-0 border-b border-border-weaker-base p-3 flex flex-col gap-3">
              <div class="text-12-medium text-text-strong">Status</div>
              <div class="flex flex-col gap-1.5">
                <For each={states}>
                  {(state) => (
                    <button
                      class="w-full rounded-md border px-3 py-2 text-left text-12-medium transition-colors"
                      classList={{
                        "border-border-strong-base bg-background-base text-text-strong": unit().status === state.id,
                        "border-border-base bg-transparent text-text-weak hover:bg-background-base/70":
                          unit().status !== state.id,
                      }}
                      onClick={() => set(state.id)}
                    >
                      {state.label}
                    </button>
                  )}
                </For>
              </div>
              <div class="grid grid-cols-2 gap-2 text-11-regular text-text-weak">
                <MetaField label="Cycle" value={unit().cycle || "Unassigned"} />
                <MetaField label="Spec" value={unit().specPath || "None"} />
                <MetaField label="Created" value={ago(unit().createdAt)} />
                <MetaField label="Updated" value={ago(unit().updatedAt)} />
                <Show when={unit().assignee}>
                  <MetaField label="Assignee" value={unit().assignee!} />
                </Show>
              </div>
            </div>
            <div class="shrink-0 border-b border-border-weaker-base px-3 py-2 flex items-center gap-2">
              <Icon name="history" size="small" class="text-icon-weak" />
              <div class="text-12-medium text-text-strong">Activity</div>
            </div>
            <EntityActivity id={props.id} type="workunit" />
          </aside>
        </div>
      )}
    </Show>
  )
}

function NoteContent(props: { id: string }) {
  const dialog = useEntityDialog()
  const sdk = dialog.sdk
  const store = useTrellisStore()
  const [content, setContent] = createSignal("")
  const [tags, setTags] = createSignal<string[]>([])
  const [saving, setSaving] = createSignal(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  let chain: Promise<void> = Promise.resolve()
  let last = { id: "", content: "", tags: "" }
  let removed = false

  createEffect(
    on(
      () => props.id,
      (id) => {
        const note = noteFromFacts(id, store.facts)
        setContent(note.content)
        setTags([...note.tags])
        last = { id, content: note.content, tags: note.tags.join(",") }
      },
    ),
  )

  const persist = async (patch: { content?: string; tags?: string[] }) => {
    const id = props.id
    const next = patch.content ?? content()
    const labels = patch.tags ?? tags()
    const key = labels.join(",")
    if (last.id === id && last.content === next && last.tags === key) return

    setSaving(true)
    try {
      await apiSaveNote(sdk.fetch, sdk.url, sdk.directory, { id, content: next, tags: labels })
      last = { id, content: next, tags: key }
      await store.refresh(false)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to save note",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const enqueue = (patch: { content?: string; tags?: string[] }) => {
    chain = chain.catch(() => undefined).then(() => persist(patch))
  }

  const queue = (patch: { content?: string; tags?: string[] }) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => enqueue(patch), 400)
  }

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    enqueue({ content: content(), tags: tags() })
    return chain
  }

  onCleanup(() => {
    if (timer) clearTimeout(timer)
    if (!removed) void flush()
  })

  const remove = async () => {
    try {
      if (timer) clearTimeout(timer)
      timer = undefined
      await chain.catch(() => undefined)
      await apiDeleteNote(sdk.fetch, sdk.url, sdk.directory, props.id)
      removed = true
      await store.refresh(false)
      dialog.pop()
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to delete note",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div class="flex h-full min-h-0">
      <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div class="shrink-0 flex items-center justify-end gap-2 border-b border-border-weaker-base px-3 py-1.5">
          <Show when={saving()}>
            <span class="text-10-regular text-text-weaker">Saving…</span>
          </Show>
          <IconButton
            icon="trash-2"
            variant="ghost"
            size="small"
            aria-label="Delete note"
            onClick={() => void remove()}
          />
        </div>
        <NoteTags
          tags={tags()}
          onChange={(next) => {
            setTags(next)
            queue({ content: content(), tags: next })
          }}
        />
        <div class="note-editor">
          <NoteEditor
            noteId={props.id}
            value={content()}
            active={true}
            onChange={(next) => {
              setContent(next)
              queue({ content: next, tags: tags() })
            }}
          />
        </div>
      </div>
      <EntitySidebar entityId={props.id} type="note" />
    </div>
  )
}

function GenericContent(props: { id: string; type: string }) {
  const dialog = useEntityDialog()
  const [ent] = createResource(() => props.id, dialog.trellis.fetchEntity, { initialValue: undefined })
  const entity = () => ent.latest
  const ctx = () => ({ id: props.id, type: props.type, facts: entity()?.facts ?? [] })
  const title = createMemo(() => resolveTitle(ctx()))
  const subtitle = createMemo(() => resolveSubtitle(ctx()))

  return <EntitySurface id={props.id} type={props.type} title={title()} subtitle={subtitle()} layout="split" />
}
