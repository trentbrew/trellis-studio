import { trellisUrl } from "@/context/trellis"
import type { Fetcher } from "@/utils/server"
import type { NoteRecord } from "./notes-model"

async function readError(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; reason?: string }
    return body.reason ?? body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export async function apiSaveNote(
  run: Fetcher,
  url: string,
  dir: string,
  input: { id: string; content: string; tags: string[] },
): Promise<NoteRecord> {
  const res = await run(trellisUrl(url, dir, "/notes/save"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      content: input.content,
      tags: input.tags,
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as NoteRecord
}

export async function apiDeleteNote(run: Fetcher, url: string, dir: string, id: string) {
  const res = await run(trellisUrl(url, dir, "/notes/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(await readError(res))
}
