export type ProcessState = "running" | "stopped" | "archived"

export type TcpListener = {
  command: string
  pid: number
  port: number
  address: string
}

export type ProcessRecord = {
  id: string
  port: number
  pid: number
  command: string
  state: ProcessState
  protocol: string
  firstSeen: number
  lastSeen: number
}

export const POLL_INTERVAL_MS = 10_000
export const MISS_THRESHOLD = 3
export const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000
