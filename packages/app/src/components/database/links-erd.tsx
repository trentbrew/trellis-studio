import { createMemo, createSignal, For, Show } from "solid-js"
import { useTrellisStore, type StoreLink } from "@/context/trellis-store"
import { entityColor, type EntityTheme } from "@/lib/entity-theme"

type Relation = {
  key: string
  source: string
  target: string
  relation: string
  count: number
}

type Card = {
  type: string
  x: number
  y: number
  fields: Field[]
}

type Field = {
  name: string
  value: string
  kind: string
}

const BOX_W = 224
const HEAD_H = 44
const ROW_H = 24
const GAP_X = 72
const GAP_Y = 52
const PAD = 64
const MAX_FIELDS = 7

export function LinksERD(props: {
  type: string
  links: StoreLink[]
  typeOf: (id: string) => string
  theme?: (type: string) => EntityTheme
}) {
  const store = useTrellisStore()
  const [zoom, setZoom] = createSignal({ x: 0, y: 0, k: 1 })
  let drag: { x: number; y: number } | undefined
  let pinch: { x: number; y: number; d: number; k: number } | undefined
  let svg: SVGSVGElement | undefined
  const all = () => props.type === "all"
  const relations = createMemo<Relation[]>(() => {
    const map = new Map<string, Relation>()
    for (const link of props.links) {
      const source = props.typeOf(link.e1)
      const target = props.typeOf(link.e2)
      const key = `${source}|${link.a}|${target}`
      const found = map.get(key)
      if (found) found.count++
      else map.set(key, { key, source, target, relation: link.a, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  })
  const theme = (type: string) => props.theme?.(type) ?? { label: type, color: entityColor(type), icon: type }
  const entities = createMemo(() => new Map(store.entities.map((e) => [e.id, e.type])))
  const types = createMemo(() =>
    [...new Set(relations().flatMap((r) => [r.source, r.target]))]
      .filter((type) => all() || type === props.type)
      .sort(),
  )
  const fields = createMemo(() => {
    const map = new Map<string, Field[]>()
    for (const type of types()) {
      const ids = new Set(store.entities.filter((e) => e.type === type).map((e) => e.id))
      const seen = new Map<string, Field>()
      for (const fact of store.facts) {
        if (!ids.has(fact.e) || seen.has(fact.a)) continue
        seen.set(fact.a, { name: fact.a, value: typeof fact.v, kind: "fact" })
      }
      for (const link of store.links) {
        const source = entities().get(link.e1)
        const target = entities().get(link.e2)
        if (source === type && !seen.has(link.a)) {
          seen.set(link.a, { name: link.a, value: target ?? "entity", kind: "link" })
        }
      }
      map.set(type, [...seen.values()].slice(0, MAX_FIELDS))
    }
    return map
  })
  const cards = createMemo<Card[]>(() =>
    types().map((type, i) => ({
      type,
      x: PAD + (i % 3) * (BOX_W + GAP_X),
      y: PAD + Math.floor(i / 3) * (HEAD_H + ROW_H * MAX_FIELDS + GAP_Y),
      fields: fields().get(type) ?? [],
    })),
  )
  const byType = createMemo(() => new Map(cards().map((card) => [card.type, card])))
  const size = createMemo(() => ({
    w: PAD * 2 + Math.min(cards().length, 3) * BOX_W + Math.max(Math.min(cards().length, 3) - 1, 0) * GAP_X,
    h:
      PAD * 2 +
      Math.max(Math.ceil(cards().length / 3), 1) * (HEAD_H + ROW_H * MAX_FIELDS) +
      Math.max(Math.ceil(cards().length / 3) - 1, 0) * GAP_Y,
  }))
  const total = () => relations().length
  const path = (source: Card, target: Card) => {
    const sx = source.x + BOX_W
    const sy = source.y + HEAD_H + 12
    const tx = target.x
    const ty = target.y + HEAD_H + 12
    const mx = sx + (tx - sx) / 2
    return `M ${sx} ${sy} H ${mx} V ${ty} H ${tx}`
  }

  const show = (relation: Relation) => all() || relation.source === props.type || relation.target === props.type

  const height = (card: Card) => HEAD_H + Math.max(card.fields.length, 1) * ROW_H

  const label = (type: string) => `/${theme(type).label}`

  const title = (name: string) => (name.length > 22 ? `${name.slice(0, 19)}…` : name)

  const value = (text: string) => (text.length > 12 ? `${text.slice(0, 9)}…` : text)

  const fk = (field: Field) => (field.kind === "link" ? " (FK)" : "")

  const key = (field: Field, i: () => number) => (i() === 0 || field.name === "id" ? "" : "")

  const rows = (card: Card) => (card.fields.length > 0 ? card.fields : [{ name: "id", value: "entity", kind: "fact" }])

  const line = {
    fill: "none",
    stroke: "var(--border-base)",
    "stroke-width": 1.5,
  }

  const node = {
    fill: "var(--surface-raised-base)",
    stroke: "var(--border-base)",
    "stroke-width": 1,
  }

  const edge = {
    fill: "var(--background-base)",
    stroke: "var(--border-strong)",
    "stroke-width": 1.5,
  }
  const scale = (value: number) => Math.min(2.5, Math.max(0.45, value))
  const point = (x: number, y: number) => {
    const matrix = svg?.getScreenCTM()?.inverse()
    if (!svg || !matrix) return { x, y }
    const p = svg.createSVGPoint()
    p.x = x
    p.y = y
    const next = p.matrixTransform(matrix)
    return { x: next.x, y: next.y }
  }
  const zoomAt = (x: number, y: number, k: number) => {
    const next = scale(k)
    const state = zoom()
    const ratio = next / state.k
    setZoom({
      x: x - (x - state.x) * ratio,
      y: y - (y - state.y) * ratio,
      k: next,
    })
  }
  const wheel = (event: WheelEvent) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const p = point(event.clientX, event.clientY)
      zoomAt(p.x, p.y, zoom().k * Math.exp(-event.deltaY * 0.01))
      return
    }
    setZoom((state) => ({
      ...state,
      x: state.x - (event.shiftKey ? event.deltaY : event.deltaX),
      y: state.y - (event.shiftKey ? 0 : event.deltaY),
    }))
  }
  const down = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    drag = { x: event.clientX, y: event.clientY }
    svg?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (!drag) return
    const prev = drag
    drag = { x: event.clientX, y: event.clientY }
    setZoom((state) => ({ ...state, x: state.x + event.clientX - prev.x, y: state.y + event.clientY - prev.y }))
  }
  const up = () => {
    drag = undefined
  }
  const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const mid = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })
  const start = (event: TouchEvent) => {
    if (event.touches.length !== 2) return
    event.preventDefault()
    const m = mid(event.touches[0], event.touches[1])
    const p = point(m.x, m.y)
    pinch = { ...p, d: dist(event.touches[0], event.touches[1]), k: zoom().k }
  }
  const touch = (event: TouchEvent) => {
    if (event.touches.length === 1 && !pinch) {
      event.preventDefault()
      const prev = drag ?? { x: event.touches[0].clientX, y: event.touches[0].clientY }
      drag = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      setZoom((state) => ({
        ...state,
        x: state.x + event.touches[0].clientX - prev.x,
        y: state.y + event.touches[0].clientY - prev.y,
      }))
      return
    }
    if (event.touches.length !== 2 || !pinch) return
    event.preventDefault()
    const m = mid(event.touches[0], event.touches[1])
    const p = point(m.x, m.y)
    setZoom((state) => ({ ...state, x: state.x + p.x - pinch!.x, y: state.y + p.y - pinch!.y }))
    zoomAt(p.x, p.y, pinch.k * (dist(event.touches[0], event.touches[1]) / pinch.d))
    pinch = { ...pinch, x: p.x, y: p.y }
  }
  const end = () => {
    drag = undefined
    pinch = undefined
  }

  return (
    <Show
      when={total() > 0}
      fallback={
        <div class="h-full flex items-center justify-center text-12-regular text-text-weaker">
          No relationships to render
        </div>
      }
    >
      <div class="h-full w-full overflow-hidden bg-background-base">
        <svg
          ref={svg}
          class="h-full min-h-[560px] w-full cursor-grab active:cursor-grabbing"
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMinYMin meet"
          style="touch-action: none;"
          onWheel={wheel}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onTouchStart={start}
          onTouchMove={touch}
          onTouchEnd={end}
          onTouchCancel={end}
        >
          <defs>
            <pattern id="links-erd-dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--text-weaker)" opacity="0.35" />
            </pattern>
          </defs>
          <g transform={`translate(${zoom().x} ${zoom().y}) scale(${zoom().k})`}>
            <rect x={-2000} y={-2000} width={size().w + 4000} height={size().h + 4000} fill="url(#links-erd-dots)" />
            <For each={relations().filter(show)}>
              {(r) => {
                const source = byType().get(r.source)
                const target = byType().get(r.target)
                if (!source || !target) return null
                return (
                  <g>
                    <path d={path(source, target)} style={line} />
                    <circle cx={source.x + BOX_W} cy={source.y + HEAD_H + 12} r={3} style={edge} />
                    <circle cx={target.x} cy={target.y + HEAD_H + 12} r={3} style={edge} />
                  </g>
                )
              }}
            </For>
            <For each={cards()}>
              {(card) => (
                <g transform={`translate(${card.x} ${card.y})`}>
                  <rect width={BOX_W} height={height(card)} rx={8} style={node} />
                  <rect width={BOX_W} height={HEAD_H} rx={8} fill="var(--surface-raised-base)" />
                  <path d={`M 0 ${HEAD_H} H ${BOX_W}`} stroke="var(--border-weaker-base)" />
                  <text x={14} y={26} fill="var(--text-strong)" font-size="12" font-family="ui-monospace, monospace">
                    {label(card.type)}
                  </text>
                  <text x={BOX_W - 18} y={26} text-anchor="middle" fill="var(--text-weaker)" font-size="16">
                    ⋮
                  </text>
                  <For each={rows(card)}>
                    {(field, i) => (
                      <g transform={`translate(0 ${HEAD_H + i() * ROW_H})`}>
                        <path
                          d={`M 12 ${ROW_H} H ${BOX_W - 12}`}
                          stroke="var(--border-weaker-base)"
                          stroke-dasharray="3 3"
                        />
                        <text
                          x={14}
                          y={16}
                          fill="var(--text-base)"
                          font-size="11"
                          font-family="ui-monospace, monospace"
                        >
                          {title(field.name)}
                          {fk(field)}
                          {key(field, i)}
                        </text>
                        <text
                          x={BOX_W - 14}
                          y={16}
                          text-anchor="end"
                          fill="var(--text-weaker)"
                          font-size="10"
                          font-family="ui-monospace, monospace"
                        >
                          {value(field.value)}
                        </text>
                      </g>
                    )}
                  </For>
                </g>
              )}
            </For>
          </g>
        </svg>
      </div>
    </Show>
  )
}
