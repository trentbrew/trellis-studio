/**
 * Repair Excalidraw fractional `index` fields after agent/mermaid merges.
 *
 * Mermaid table output (and concat with existing shapes) can place bound text
 * before its container in index order, which triggers
 * `InvalidFractionalIndexError` in Excalidraw 0.18. Deleted elements must be
 * re-keyed too — Excalidraw validates every element index when inserting text.
 */

import { generateKeyBetween, generateNKeysBetween } from "./fractional-keys"

/** True when `index` satisfies Excalidraw 0.18 / fractional-indexing rules. */
export function isValidElementIndex(index: unknown): index is string {
  if (typeof index !== "string" || index.length === 0) return false
  try {
    generateKeyBetween(index, null)
    return true
  } catch {
    return false
  }
}

function compareFractionalIndex(a: unknown, b: unknown): number {
  const ai = typeof a === "string" ? a : ""
  const bi = typeof b === "string" ? b : ""
  if (!ai && !bi) return 0
  if (!ai) return -1
  if (!bi) return 1
  return ai < bi ? -1 : ai > bi ? 1 : 0
}

function containerId(el: Record<string, unknown>): string | null {
  const id = el.containerId
  return typeof id === "string" && id.length > 0 ? id : null
}

function isBoundText(el: Record<string, unknown>): boolean {
  return el.type === "text" && containerId(el) != null
}

/**
 * Order elements so bound text follows its container, then assign fresh indices.
 */
export function repairElementIndices(
  elements: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const deleted = elements.filter((el) => el.isDeleted === true)
  const active = elements
    .filter((el) => el.isDeleted !== true)
    .sort((a, b) => compareFractionalIndex(a.index, b.index))

  const boundByContainer = new Map<string, Record<string, unknown>[]>()
  const unbound: Record<string, unknown>[] = []

  for (const el of active) {
    if (isBoundText(el)) {
      const cid = containerId(el)!
      const list = boundByContainer.get(cid) ?? []
      list.push(el)
      boundByContainer.set(cid, list)
      continue
    }
    unbound.push(el)
  }

  const ordered: Record<string, unknown>[] = []
  for (const el of unbound) {
    ordered.push(el)
    const id = typeof el.id === "string" ? el.id : ""
    const bound = id ? boundByContainer.get(id) : undefined
    if (bound?.length) {
      ordered.push(...bound)
      boundByContainer.delete(id)
    }
  }

  for (const orphan of boundByContainer.values()) {
    ordered.push(...orphan)
  }

  const all = [...ordered, ...deleted]
  const keys = generateNKeysBetween(null, null, all.length)
  return all.map((el, i) => ({ ...el, index: keys[i] }))
}
