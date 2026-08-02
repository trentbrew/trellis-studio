import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { ExternalRef } from "./types"

export type IssueMap = Record<string, ExternalRef>

export function mapDir(dir?: string): string {
  return dir ?? join(homedir(), ".config", "trellis-sync")
}

export function mapPath(adapter: string, project?: string, dir?: string): string {
  const name = project ? `${adapter}.${project}.json` : `${adapter}.json`
  return join(mapDir(dir), name)
}

export function loadMap(adapter: string, dir?: string, project?: string): IssueMap {
  const p = mapPath(adapter, project, dir)
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, "utf-8")) as IssueMap
}

export function saveMap(adapter: string, map: IssueMap, dir?: string, project?: string) {
  const p = mapPath(adapter, project, dir)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, JSON.stringify(map, null, 2))
}
