import { evalBoolean } from "./eval"
import type { BaseFilterNode, NoteRecord } from "./types"

export function matches(filter: BaseFilterNode | undefined, note: NoteRecord): boolean {
  if (!filter) return true
  switch (filter.kind) {
    case "and":
      return filter.items.every((item) => matches(item, note))
    case "or":
      return filter.items.length === 0 ? true : filter.items.some((item) => matches(item, note))
    case "not":
      return !matches(filter.item, note)
    case "expr":
      return evalBoolean(filter.src, { note })
  }
}

export function applyFilter(notes: NoteRecord[], filter: BaseFilterNode | undefined): NoteRecord[] {
  if (!filter) return notes
  return notes.filter((note) => matches(filter, note))
}

export function sortNotes(notes: NoteRecord[], order: string[] | undefined): NoteRecord[] {
  if (!order || order.length === 0) return notes
  const copy = [...notes]
  copy.sort((a, b) => {
    for (const key of order) {
      const av = readProperty(a, key)
      const bv = readProperty(b, key)
      const c = compareAny(av, bv)
      if (c !== 0) return c
    }
    return 0
  })
  return copy
}

export function readProperty(note: NoteRecord, key: string): unknown {
  // file.foo accesses
  if (key.startsWith("file.")) {
    const rest = key.slice(5)
    return (note.file as unknown as Record<string, unknown>)[rest]
  }
  if (key.startsWith("note.")) {
    const rest = key.slice(5)
    return note.properties[rest]
  }
  // Bare: try properties first, then file.
  if (Object.prototype.hasOwnProperty.call(note.properties, key)) return note.properties[key]
  return (note.file as unknown as Record<string, unknown>)[key]
}

function compareAny(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === "number" && typeof b === "number") return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a).localeCompare(String(b))
}
