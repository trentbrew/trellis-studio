import { writeTrellisMeta } from "./bindings"
import { EXCALIDRAW_FONT_HELVETICA } from "./ontology"
import type { TrellisElementMeta } from "./ontology"
import { fitTextElement } from "./text-layout"

let seedCounter = 1

export function randomElementId(): string {
  return `trellis_${Date.now().toString(36)}_${(seedCounter++).toString(36)}`
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** Minimal defaults so Excalidraw accepts agent-generated elements. */
export function baseElement(
  type: string,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: type === "text" ? "transparent" : "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "ellipse" ? null : { type: 3 },
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...(type === "text"
      ? {
          autoResize: true,
          fontSize: 20,
          fontFamily: EXCALIDRAW_FONT_HELVETICA,
          lineHeight: 1.25,
          textAlign: "left",
          verticalAlign: "top",
        }
      : {}),
    ...partial,
  }
}

export function cloneElementsForInsert(
  elements: readonly Record<string, unknown>[],
  options: {
    offsetX: number
    offsetY: number
    meta?: TrellisElementMeta
    label?: string
  },
): Record<string, unknown>[] {
  const idMap = new Map<string, string>()
  for (const el of elements) {
    const oldId = typeof el.id === "string" ? el.id : randomElementId()
    idMap.set(oldId, randomElementId())
  }

  return elements.map((el) => {
    const oldId = typeof el.id === "string" ? el.id : ""
    const next: Record<string, unknown> = {
      ...JSON.parse(JSON.stringify(el)),
      id: idMap.get(oldId) ?? randomElementId(),
      seed: randomSeed(),
      versionNonce: randomSeed(),
      updated: Date.now(),
    }
    if (typeof next.x === "number") next.x = (next.x as number) + options.offsetX
    if (typeof next.y === "number") next.y = (next.y as number) + options.offsetY

    if (options.label != null) {
      if (next.type === "text") {
        next.text = options.label
        next.originalText = options.label
      } else if (typeof next.text === "string" && next.text.includes("{{label}}")) {
        next.text = (next.text as string).replaceAll("{{label}}", options.label)
        if (typeof next.originalText === "string") {
          next.originalText = next.originalText.replaceAll("{{label}}", options.label)
        }
      }
    }

    if (options.meta) {
      const meta = { ...options.meta }
      if (options.label && !meta.label) meta.label = options.label
      Object.assign(next, writeTrellisMeta(next, meta))
    }

    return next.type === "text" ? fitTextElement(next) : next
  })
}
