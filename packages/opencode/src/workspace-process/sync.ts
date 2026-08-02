import { Trellis } from "@/trellis"
import { StoreSDK } from "@/trellis/store-sdk"
import { listTcpListeners } from "./lsof"
import { hostIdForDirectory, processId } from "./host"
import { ARCHIVE_AFTER_MS, MISS_THRESHOLD, type ProcessRecord, type ProcessState, type TcpListener } from "./types"

type StoreFact = { a: string; v: unknown }
type StoreLink = { e1: string; a: string; e2: string }

function factVal(facts: StoreFact[], attr: string): unknown {
  return facts.find((f) => f.a === attr)?.v
}

function runsOnHost(links: StoreLink[], procId: string, hostId: string): boolean {
  const runsOn = links.find((l) => l.a === "runsOn")
  if (!runsOn) return false
  const other = runsOn.e1 === procId ? runsOn.e2 : runsOn.e1
  return other === hostId
}

type SyncState = {
  missByPort: Map<number, number>
}

const syncStateByDir = new Map<string, SyncState>()

function stateForDir(dir: string): SyncState {
  let s = syncStateByDir.get(dir)
  if (!s) {
    s = { missByPort: new Map() }
    syncStateByDir.set(dir, s)
  }
  return s
}

function ensureHost(hostId: string, dir: string, now: number) {
  const existing = Trellis.storeEntity(hostId, dir)
  if (!existing) {
    StoreSDK.defineEntity(
      "ComputeHost",
      hostId,
      {
        sandboxId: hostId,
        directory: dir,
        firstSeen: now,
        lastSeen: now,
      },
      dir,
    )
    return
  }
  StoreSDK.updateEntity(hostId, { lastSeen: now }, dir)
}

function upsertProcess(
  hostId: string,
  listener: TcpListener,
  dir: string,
  now: number,
  state: ProcessState,
  firstSeen?: number,
) {
  const id = processId(hostId, listener.port)
  const existing = Trellis.storeEntity(id, dir)
  const seen =
    firstSeen ??
    (existing ? Number((existing.facts as StoreFact[]).find((f) => f.a === "firstSeen")?.v) || now : now)

  const attrs: Record<string, string | number | boolean> = {
    port: listener.port,
    pid: listener.pid,
    command: listener.command.slice(0, 500),
    protocol: "tcp",
    state,
    firstSeen: seen,
    lastSeen: now,
  }

  if (!existing) {
    StoreSDK.defineEntity("Process", id, attrs, dir)
    StoreSDK.relate(id, "runsOn", hostId, dir)
    return
  }

  StoreSDK.updateEntity(id, attrs, dir)
  const hasLink = (existing.links as StoreLink[]).some((l) => l.a === "runsOn" && (l.e1 === id || l.e2 === hostId))
  if (!hasLink) StoreSDK.relate(id, "runsOn", hostId, dir)
}

function markStopped(hostId: string, port: number, dir: string, now: number) {
  const id = processId(hostId, port)
  const existing = Trellis.storeEntity(id, dir)
  if (!existing) return

  const first = Number((existing.facts as StoreFact[]).find((f) => f.a === "firstSeen")?.v) || now
  StoreSDK.updateEntity(
    id,
    {
      state: "stopped",
      lastSeen: now,
      port,
    },
    dir,
  )

  if (now - first >= ARCHIVE_AFTER_MS) {
    StoreSDK.updateEntity(id, { state: "archived" }, dir)
  }
}

/** Mark every process on this host stopped (sandbox restart / reprovision). */
export function stopAllProcessesOnHost(dir: string, hostId?: string) {
  const id = hostId ?? hostIdForDirectory(dir)
  const now = Date.now()
  const processes = StoreSDK.findByType("Process", undefined, dir)
  for (const proc of processes) {
    const detail = Trellis.storeEntity(proc.id, dir)
    if (!detail) continue
    const facts = detail.facts as StoreFact[]
    const links = detail.links as StoreLink[]
    if (!runsOnHost(links, proc.id, id)) continue
    const state = factVal(facts, "state")
    if (state === "archived") continue
    StoreSDK.updateEntity(proc.id, { state: "stopped", lastSeen: now }, dir)
  }
  stateForDir(dir).missByPort.clear()
}

export async function syncWorkspaceListeners(dir: string): Promise<{ hostId: string; listeners: TcpListener[] }> {
  const hostId = hostIdForDirectory(dir)
  const now = Date.now()
  const sync = stateForDir(dir)
  const listeners = await listTcpListeners(dir)
  const seenPorts = new Set(listeners.map((l) => l.port))

  ensureHost(hostId, dir, now)

  for (const listener of listeners) {
    sync.missByPort.delete(listener.port)
    const id = processId(hostId, listener.port)
    const existing = Trellis.storeEntity(id, dir)
    const facts = (existing?.facts ?? []) as StoreFact[]
    const prevState = factVal(facts, "state") as ProcessState | undefined
    const firstSeen = existing ? Number(factVal(facts, "firstSeen")) : undefined
    const state: ProcessState = prevState === "archived" ? "archived" : "running"
    upsertProcess(hostId, listener, dir, now, state, firstSeen)
  }

  for (const proc of StoreSDK.findByType("Process", undefined, dir)) {
    const detail = Trellis.storeEntity(proc.id, dir)
    if (!detail) continue
    const facts = detail.facts as StoreFact[]
    const links = detail.links as StoreLink[]
    if (!runsOnHost(links, proc.id, hostId)) continue

    const port = Number(factVal(facts, "port"))
    if (!Number.isFinite(port) || seenPorts.has(port)) continue

    const state = factVal(facts, "state")
    if (state === "archived") continue

    const misses = (sync.missByPort.get(port) ?? 0) + 1
    sync.missByPort.set(port, misses)
    if (misses >= MISS_THRESHOLD) {
      markStopped(hostId, port, dir, now)
      sync.missByPort.delete(port)
    }
  }

  return { hostId, listeners }
}

export function listActiveProcesses(dir: string, hostId?: string): ProcessRecord[] {
  const id = hostId ?? hostIdForDirectory(dir)
  const out: ProcessRecord[] = []

  for (const proc of StoreSDK.findByType("Process", { state: "running" }, dir)) {
    const detail = Trellis.storeEntity(proc.id, dir)
    if (!detail) continue
    const facts = detail.facts as StoreFact[]
    const links = detail.links as StoreLink[]
    if (!runsOnHost(links, proc.id, id)) continue

    const port = Number(factVal(facts, "port"))
    const pid = Number(factVal(facts, "pid"))
    const command = String(factVal(facts, "command") ?? "")
    const state = (factVal(facts, "state") ?? "running") as ProcessState
    const firstSeen = Number(factVal(facts, "firstSeen") ?? 0)
    const lastSeen = Number(factVal(facts, "lastSeen") ?? 0)

    if (!Number.isFinite(port)) continue

    out.push({
      id: proc.id,
      port,
      pid: Number.isFinite(pid) ? pid : 0,
      command,
      state,
      protocol: String(factVal(facts, "protocol") ?? "tcp"),
      firstSeen,
      lastSeen,
    })
  }

  return out.sort((a, b) => a.port - b.port)
}
