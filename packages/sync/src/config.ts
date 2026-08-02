import { readFileSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export type AdapterConfig = {
  repo?: string
  project?: string
  statuses?: string[]
  includeLabels?: string[]
  excludeLabels?: string[]
  exclude?: string[]
  labels?: boolean
}

export type SyncConfig = Record<string, AdapterConfig>

export function loadConfig(dir?: string): SyncConfig {
  const p = join(dir ?? join(homedir(), ".config", "trellis-sync"), "config.json")
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, "utf-8")) as SyncConfig
}

/** Scoped config (`adapter.project`) wins over unscoped (`adapter`); fields merge. */
export function projectConfig(cfg: SyncConfig, adapter: string, project?: string): AdapterConfig {
  const base = cfg[adapter] ?? {}
  const scoped = project ? cfg[`${adapter}.${project}`] ?? {} : {}
  return { ...base, ...scoped }
}
