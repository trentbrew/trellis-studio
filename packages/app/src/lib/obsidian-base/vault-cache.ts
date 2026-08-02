import type { NoteRecord } from "./types"

type VaultCacheEntry = {
  notes: NoteRecord[]
}

const cache = new Map<string, VaultCacheEntry>()
const inflight = new Map<string, Promise<NoteRecord[]>>()

export function invalidateVaultCache(directory?: string) {
  if (directory) {
    cache.delete(directory)
    inflight.delete(directory)
    return
  }
  cache.clear()
  inflight.clear()
}

export function loadVaultCached(directory: string, load: () => Promise<NoteRecord[]>): Promise<NoteRecord[]> {
  const cached = cache.get(directory)
  if (cached) return Promise.resolve(cached.notes)

  const pending = inflight.get(directory)
  if (pending) return pending

  const promise = load()
    .then((notes) => {
      cache.set(directory, { notes })
      inflight.delete(directory)
      return notes
    })
    .catch((error) => {
      inflight.delete(directory)
      throw error
    })

  inflight.set(directory, promise)
  return promise
}

export function peekVaultCache(directory: string): NoteRecord[] | undefined {
  return cache.get(directory)?.notes
}
