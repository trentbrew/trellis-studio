import type { StoreFact } from "@/context/trellis-store"
import { trellisUrl } from "@/context/trellis"
import type { Fetcher } from "@/utils/server"
import {
  isSketchWhiteboardPath,
  slugFromWhiteboardPath,
  whiteboardEntityId,
  whiteboardTitle,
} from "@/lib/whiteboard/schema"
import {
  findWhiteboardEntityId,
  listWhiteboardsFromStore,
  mergeWhiteboardPaths,
  type WhiteboardRecord,
} from "./store-model"

export type { WhiteboardRecord } from "./store-model"
export { findWhiteboardEntityId, listWhiteboardsFromStore, mergeWhiteboardPaths } from "./store-model"

async function readError(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; reason?: string }
    return body.reason ?? body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

async function retractEntityFacts(
  run: Fetcher,
  url: string,
  dir: string,
  id: string,
  facts: StoreFact[],
): Promise<void> {
  const entityFacts = facts.filter((fact) => fact.e === id)
  if (!entityFacts.length) return
  const res = await run(trellisUrl(url, dir, "/store/retract"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facts: entityFacts.map((fact) => ({ e: fact.e, a: fact.a, v: fact.v })),
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
}

export async function registerWhiteboardEntity(
  run: Fetcher,
  url: string,
  dir: string,
  input: { path: string; title?: string },
): Promise<string | undefined> {
  if (isSketchWhiteboardPath(input.path)) return undefined

  const slug = slugFromWhiteboardPath(input.path)
  const id = whiteboardEntityId(slug)
  const title = input.title?.trim() || whiteboardTitle(input.path)
  const now = new Date().toISOString()

  const res = await run(trellisUrl(url, dir, "/store/assert"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facts: [
        { e: id, a: "type", v: "whiteboard" },
        { e: id, a: "path", v: input.path },
        { e: id, a: "title", v: title },
        { e: id, a: "createdAt", v: now },
        { e: id, a: "updatedAt", v: now },
      ],
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  window.dispatchEvent(new CustomEvent("trellis-store-changed", { detail: { quiet: true } }))
  return id
}

export async function updateWhiteboardEntityPath(
  run: Fetcher,
  url: string,
  dir: string,
  input: { from: string; to: string },
  facts: StoreFact[],
): Promise<void> {
  if (isSketchWhiteboardPath(input.from) && isSketchWhiteboardPath(input.to)) return

  const fromId = findWhiteboardEntityId(input.from, facts)
  if (fromId) await retractEntityFacts(run, url, dir, fromId, facts)
  if (!isSketchWhiteboardPath(input.to)) {
    await registerWhiteboardEntity(run, url, dir, { path: input.to })
  }
}

export async function deleteWhiteboardEntity(
  run: Fetcher,
  url: string,
  dir: string,
  path: string,
  facts: StoreFact[],
): Promise<void> {
  if (isSketchWhiteboardPath(path)) return
  const id = findWhiteboardEntityId(path, facts)
  if (!id) return
  await retractEntityFacts(run, url, dir, id, facts)
  window.dispatchEvent(new CustomEvent("trellis-store-changed", { detail: { quiet: true } }))
}
