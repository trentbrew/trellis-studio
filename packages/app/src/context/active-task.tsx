import { createContext, createSignal, type ParentProps, useContext } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { TrellisIssue } from "./trellis"

export type BackgroundJob = {
  id: string
  type: "sync" | "index" | "generate" | "criteria"
  status: "queued" | "running" | "complete" | "error"
  progress?: number
  label: string
  startedAt: number
}

type ActiveTaskValue = {
  activeIssue: () => TrellisIssue | undefined
  setActiveIssue: (issue: TrellisIssue | undefined) => void
  jobs: () => BackgroundJob[]
  addJob: (job: Omit<BackgroundJob, "id" | "startedAt">) => string
  updateJob: (id: string, patch: Partial<BackgroundJob>) => void
  removeJob: (id: string) => void
}

const ActiveTaskCtx = createContext<ActiveTaskValue>()

export function ActiveTaskProvider(props: ParentProps) {
  const [activeIssue, setActiveIssue] = createSignal<TrellisIssue | undefined>()
  const [jobs, setJobs] = createStore<BackgroundJob[]>([])

  const addJob = (job: Omit<BackgroundJob, "id" | "startedAt">): string => {
    const id = crypto.randomUUID()
    setJobs(produce((j) => j.push({ ...job, id, startedAt: Date.now() })))
    return id
  }

  const updateJob = (id: string, patch: Partial<BackgroundJob>) => {
    setJobs(
      (j) => j.id === id,
      produce((j) => Object.assign(j, patch)),
    )
  }

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }

  const value: ActiveTaskValue = {
    activeIssue,
    setActiveIssue,
    jobs: () => jobs,
    addJob,
    updateJob,
    removeJob,
  }

  return <ActiveTaskCtx.Provider value={value}>{props.children}</ActiveTaskCtx.Provider>
}

export function useActiveTask(): ActiveTaskValue {
  const ctx = useContext(ActiveTaskCtx)
  if (!ctx) throw new Error("ActiveTask context must be used within a context provider")
  return ctx
}

/** Returns undefined when rendered outside the provider (e.g. home page). */
export function useActiveTaskOptional(): ActiveTaskValue | undefined {
  return useContext(ActiveTaskCtx)
}
