export async function* lines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buf += decoder.decode(chunk.value, { stream: true })
      const split = buf.split("\n")
      buf = split.pop() ?? ""
      for (const line of split) yield line
    }
    if (buf.trim()) yield buf
  } finally {
    reader.releaseLock()
  }
}

export function json(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, any>
  } catch {
    return undefined
  }
}

export async function reachable(url: string, ms = 2000) {
  return fetch(url, { signal: AbortSignal.timeout(ms) })
    .then((res) => res.ok)
    .catch(() => false)
}
