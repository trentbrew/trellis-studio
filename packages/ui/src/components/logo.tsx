import { createSignal, onMount, onCleanup, For } from "solid-js"

// Pattern definitions: 10x10 grids (1 = dot on, 0 = dot off)
const turtle = [
  "0000110000",
  "0100110000",
  "0000000000",
  "0001111000",
  "1101111011",
  "1101111011",
  "0001111000",
  "0000000000",
  "0000110010",
  "0000110000",
]

const heart = [
  "0000000000",
  "0110001100",
  "1111011110",
  "1111111110",
  "1111111110",
  "0111111100",
  "0011111000",
  "0001110000",
  "0000100000",
  "0000000000",
]

const empty = Array(10).fill("0000000000")

// Transform utilities
const flip_h = (p: string[]) => p.map((row) => row.split("").reverse().join(""))
const flip_v = (p: string[]) => [...p].reverse()
const rotate_cw = (p: string[]) =>
  Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => p[9 - c][r]).join(""))
const rotate_ccw = (p: string[]) =>
  Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => p[c][9 - r]).join(""))
const invert = (p: string[]) =>
  p.map((row) =>
    row
      .split("")
      .map((c) => (c === "1" ? "0" : "1"))
      .join(""),
  )
const shift_r = (p: string[]) => p.map((row) => row[9] + row.slice(0, 9))
const shift_l = (p: string[]) => p.map((row) => row.slice(1) + row[0])
const shift_d = (p: string[]) => [p[9], ...p.slice(0, 9)]
const shift_u = (p: string[]) => [...p.slice(1), p[0]]

// Wipe transitions
const wipe_diag = (from: string[], to: string[], step: number, total: number) => {
  const threshold = Math.floor((step / total) * 20)
  return from.map((row, r) =>
    row
      .split("")
      .map((c, i) => (r + i < threshold ? to[r][i] : c))
      .join(""),
  )
}
const wipe_down = (from: string[], to: string[], step: number, total: number) => {
  const threshold = Math.floor((step / total) * 10)
  return from.map((row, r) => (r < threshold ? to[r] : row))
}
const wipe_right = (from: string[], to: string[], step: number, total: number) => {
  const threshold = Math.floor((step / total) * 10)
  return from.map((row) =>
    row
      .split("")
      .map((c, i) => (i < threshold ? to[from.indexOf(row)][i] : c))
      .join(""),
  )
}

// Build the complete animation sequence
function buildFrames() {
  const frames = []

  // Intro: hold turtle
  for (let i = 0; i < 25; i++) frames.push({ p: turtle, d: 100 })

  // Wipe to empty
  for (let i = 1; i <= 12; i++) frames.push({ p: wipe_diag(turtle, empty, i, 12), d: 45 })
  frames.push({ p: empty, d: 200 })
  frames.push({ p: empty, d: 300, rot: 0 })

  // Wipe to heart
  for (let i = 1; i <= 12; i++) frames.push({ p: wipe_diag(empty, heart, i, 12), d: 45 })

  // Heartbeat sequence (x4)
  for (let beat = 0; beat < 4; beat++) {
    frames.push({ p: heart, d: 300, pulse: true })
    frames.push({ p: heart, d: 250, pulse: false })
    frames.push({ p: heart, d: 200, pulse: true })
    frames.push({ p: heart, d: 600, pulse: false })
  }

  // Hold heart, wipe to empty
  for (let i = 0; i < 12; i++) frames.push({ p: heart, d: 150 })
  for (let i = 1; i <= 12; i++) frames.push({ p: wipe_diag(heart, empty, i, 12), d: 45 })
  frames.push({ p: empty, d: 200 })
  frames.push({ p: empty, d: 300, rot: 45 })

  // Wipe to turtle
  for (let i = 0; i < 5; i++) frames.push({ p: empty, d: 80 })
  for (let i = 1; i <= 10; i++) frames.push({ p: wipe_diag(empty, turtle, i, 10), d: 50 })
  for (let i = 0; i < 15; i++) frames.push({ p: turtle, d: 100 })

  // Invert transition
  const inv = invert(turtle)
  for (let i = 1; i <= 12; i++) frames.push({ p: wipe_diag(turtle, inv, i, 12), d: 50 })
  for (let i = 0; i < 6; i++) frames.push({ p: inv, d: 100 })
  for (let i = 1; i <= 12; i++) frames.push({ p: wipe_diag(inv, turtle, i, 12), d: 50 })
  for (let i = 0; i < 5; i++) frames.push({ p: turtle, d: 100 })

  // Shift animations
  let current = turtle
  current = shift_r(current)
  frames.push({ p: current, d: 100 })
  current = shift_r(current)
  frames.push({ p: current, d: 100 })
  current = shift_l(current)
  frames.push({ p: current, d: 100 })
  current = shift_l(current)
  frames.push({ p: current, d: 100 })
  current = shift_u(current)
  frames.push({ p: current, d: 100 })
  current = shift_u(current)
  frames.push({ p: current, d: 100 })
  current = shift_d(current)
  frames.push({ p: current, d: 100 })
  current = shift_d(current)
  frames.push({ p: current, d: 100 })
  for (let i = 0; i < 5; i++) frames.push({ p: turtle, d: 100 })

  // Clockwise rotation
  current = turtle
  for (let i = 0; i < 4; i++) {
    current = rotate_cw(current)
    frames.push({ p: current, d: 200 })
  }
  for (let i = 0; i < 3; i++) frames.push({ p: turtle, d: 100 })

  // Counter-clockwise rotation
  current = turtle
  for (let i = 0; i < 4; i++) {
    current = rotate_ccw(current)
    frames.push({ p: current, d: 200 })
  }

  // Flip vertical
  const flipped_v = flip_v(turtle)
  for (let i = 1; i <= 10; i++) frames.push({ p: wipe_down(turtle, flipped_v, i, 10), d: 60 })
  for (let i = 0; i < 5; i++) frames.push({ p: flipped_v, d: 100 })

  // Flip horizontal
  const flipped_h = flip_h(flipped_v)
  for (let i = 1; i <= 10; i++) frames.push({ p: wipe_right(flipped_v, flipped_h, i, 10), d: 60 })
  for (let i = 0; i < 5; i++) frames.push({ p: flipped_h, d: 100 })

  // Flash between states
  frames.push({ p: turtle, d: 70 })
  frames.push({ p: flipped_h, d: 70 })
  frames.push({ p: turtle, d: 70 })
  frames.push({ p: flipped_h, d: 70 })
  frames.push({ p: turtle, d: 70 })

  // Outro: hold turtle, loop
  for (let i = 0; i < 25; i++) frames.push({ p: turtle, d: 100 })

  return frames
}

const ALL_FRAMES = buildFrames()

function patternToDots(pattern: string[]): boolean[] {
  const dots = Array(100).fill(false)
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      dots[r * 10 + c] = pattern[r][c] === "1"
    }
  }
  return dots
}

export default function TurtleGrid(props: { class?: string }) {
  const [dots, setDots] = createSignal(Array(100).fill(false))
  const [dotPulse, setDotPulse] = createSignal(false)
  const [rotation, setRotation] = createSignal(45)
  let frameIdx = 0
  let timeoutRef: ReturnType<typeof setTimeout> | null = null

  function tick() {
    const { p, d, rot, pulse } = ALL_FRAMES[frameIdx]
    setDots(patternToDots(p))
    if (rot !== undefined) setRotation(rot)
    if (pulse !== undefined) setDotPulse(pulse)
    frameIdx = (frameIdx + 1) % ALL_FRAMES.length
    timeoutRef = setTimeout(tick, d)
  }

  onMount(() => {
    tick()
  })

  onCleanup(() => {
    if (timeoutRef) clearTimeout(timeoutRef)
  })

  const dotStyle = (isOn: boolean) => {
    const pulse = dotPulse()
    const scale = isOn && pulse ? 1.25 : isOn ? 1 : 0.6
    const bg = isOn && pulse ? "rgba(255,255,255,1)" : isOn ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0)"
    const boxShadow =
      isOn && pulse ? "0 0 6px rgba(255,255,255,0.5)" : isOn ? "0 0 4px rgba(255,255,255,0.3)" : "0 0 0px rgba(0,0,0,0)"
    return {
      transform: `scale(${scale})`,
      background: bg,
      "box-shadow": boxShadow,
      transition: isOn
        ? "transform 0.15s ease-out, background 0.15s ease-out, box-shadow 0.15s ease-out"
        : "transform 0.2s ease-out, background 0.2s ease-out, box-shadow 0.2s ease-out",
    }
  }

  return (
    <div classList={{ [props.class ?? ""]: !!props.class }}>
      <style>{`
        .turtle-grid {
          display: grid;
          grid-template-columns: repeat(10, 1fr);
          gap: 6px;
          transform: rotate(${rotation()}deg);
          transition: transform 0.3s ease-out;
          width: fit-content;
          margin: 0 auto;
        }
        .turtle-dot {
          width: 8px;
          height: 8px;
          border-radius: 36%;
          background: rgba(255,255,255,0.06);
        }
      `}</style>
      <div class="turtle-grid scale-75 mx-auto">
        <For each={dots()}>{(isOn) => <div class="turtle-dot" style={dotStyle(isOn)} />}</For>
      </div>
    </div>
  )
}

export { TurtleGrid as Logo }

// Original logo exports for backwards compatibility
import type { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}
