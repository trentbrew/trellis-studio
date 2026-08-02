import { existsSync } from "node:fs"
import path from "node:path"
import { Instance } from "../project/instance"
import { File } from "../file"

export namespace Journal {
  function pad(n: number) {
    return String(n).padStart(2, "0")
  }

  /** Local YYYY-MM-DD for a date. */
  export function dateKey(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  export function relPath(dir: string, date = new Date()): string {
    const base = dir.trim().replace(/^\/+|\/+$/g, "") || "journal"
    return `${base}/${dateKey(date)}.md`
  }

  function template(date: Date): string {
    const heading = date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    return [
      "---",
      `date: ${dateKey(date)}`,
      `created: ${date.toISOString()}`,
      "tags: [[journal]]",
      "---",
      "",
      `# ${heading}`,
      "",
      "## Notes",
      "",
      "## Done",
      "",
      "## Tomorrow",
      "",
    ].join("\n")
  }

  /**
   * Create today's journal entry if it does not already exist.
   * Idempotent: returns `{ created: false }` when the file is already present
   * so re-running (catch-up, manual run) never clobbers written content.
   */
  export async function ensure(input?: { dir?: string; date?: Date }): Promise<{ path: string; created: boolean }> {
    const date = input?.date ?? new Date()
    const rel = relPath(input?.dir ?? "journal", date)
    const full = path.join(Instance.directory, rel)
    if (existsSync(full)) return { path: rel, created: false }
    await File.write({ path: rel, content: template(date) })
    return { path: rel, created: true }
  }
}
