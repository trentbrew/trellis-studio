import { createSignal } from "solid-js"

const [msg, setMsg] = createSignal<string | undefined>()
let timer: ReturnType<typeof setTimeout> | undefined

export function showStatus(text: string, ms = 3000) {
  if (timer) clearTimeout(timer)
  setMsg(text)
  timer = setTimeout(() => setMsg(undefined), ms)
}

export const statusMessage = msg
