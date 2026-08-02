export type TtsState = "idle" | "loading" | "playing"

export type MediaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

let audio: HTMLAudioElement | undefined
let blob: string | undefined
let pending: AbortController | undefined
let state: TtsState = "idle"
const listeners = new Set<(value: TtsState) => void>()

function ttsLog(level: "debug" | "warn" | "error", event: string, extra?: Record<string, unknown>) {
  const payload = { event, ...extra }
  if (level === "warn") console.warn("[tts]", payload)
  else if (level === "error") console.error("[tts]", payload)
  else console.debug("[tts]", payload)
}

const notify = (value: TtsState) => {
  state = value
  for (const fn of listeners) fn(value)
}

export function ttsState() {
  return state
}

/** @deprecated use ttsState() */
export function ttsPlaying() {
  return state === "playing" || state === "loading"
}

export function onTtsState(fn: (value: TtsState) => void) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

/** @deprecated use onTtsState */
export function onTtsPlaying(fn: (value: boolean) => void) {
  return onTtsState((next) => fn(next === "playing" || next === "loading"))
}

const detach = () => {
  if (!audio) return
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
  audio = undefined
}

export function stopTts() {
  ttsLog("debug", "stop")
  pending?.abort()
  pending = undefined
  if (typeof window !== "undefined") window.speechSynthesis?.cancel()
  detach()
  if (blob) {
    URL.revokeObjectURL(blob)
    blob = undefined
  }
  notify("idle")
}

function stripMarkdown(text: string) {
  let next = text
  next = next.replace(/```[\s\S]*?```/g, " ")
  next = next.replace(/`([^`]+)`/g, "$1")
  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  next = next.replace(/^#{1,6}\s+/gm, "")
  next = next.replace(/^\s*[-*+]\s+/gm, "")
  next = next.replace(/^\s*\d+\.\s+/gm, "")
  next = next.replace(/[*_~>#|]/g, "")
  return next.replace(/\s+/g, " ").trim()
}

async function readError(res: Response) {
  try {
    const json = (await res.clone().json()) as { error?: string; message?: string }
    return json.error ?? json.message
  } catch {
    return undefined
  }
}

function waitForAudio(el: HTMLAudioElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"))
      return
    }
    const done = (fn: () => void) => {
      clearTimeout(timer)
      el.removeEventListener("loadeddata", onReady)
      el.removeEventListener("canplay", onReady)
      el.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
      fn()
    }
    const onReady = () => done(resolve)
    const onError = () => done(() => reject(new Error("audio load failed")))
    const onAbort = () => done(() => reject(new Error("aborted")))
    const timer = window.setTimeout(onReady, 4_000)
    el.addEventListener("loadeddata", onReady, { once: true })
    el.addEventListener("canplay", onReady, { once: true })
    el.addEventListener("error", onError, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady()
  })
}

function speakBrowser(text: string, signal: AbortSignal) {
  const synth = window.speechSynthesis
  if (!synth) {
    ttsLog("warn", "browser fallback unavailable", { reason: "speechSynthesis missing" })
    return Promise.resolve(false)
  }
  const plain = stripMarkdown(text)
  if (!plain) {
    ttsLog("warn", "browser fallback unavailable", { reason: "no speakable text after markdown strip" })
    return Promise.resolve(false)
  }
  const voices = synth.getVoices().map((voice) => voice.name)
  ttsLog("warn", "browser fallback start", {
    chars: plain.length,
    voiceCount: voices.length,
    voices: voices.slice(0, 5),
  })
  synth.cancel()
  return new Promise<boolean>((resolve) => {
    const utter = new SpeechSynthesisUtterance(plain.slice(0, 8_000))
    let settled = false
    const finish = (ok: boolean, reason?: string) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      ttsLog(ok ? "debug" : "warn", ok ? "browser fallback playing" : "browser fallback failed", { reason })
      resolve(ok)
    }
    const onAbort = () => {
      synth.cancel()
      finish(false, "aborted")
    }
    utter.onstart = () => {
      notify("playing")
      finish(true, utter.voice?.name ?? "default")
    }
    utter.onend = () => stopTts()
    utter.onerror = (event) => {
      stopTts()
      finish(false, event.error ?? "utterance error")
    }
    signal.addEventListener("abort", onAbort, { once: true })
    synth.speak(utter)
    window.setTimeout(() => {
      if (!settled && synth.speaking) {
        notify("playing")
        finish(true, "speaking after delay")
      }
    }, 250)
  })
}

export type PlayTtsOptions = {
  fetch?: MediaFetch
  onError?: (message: string) => void
}

export async function playTts(base: string, text: string, opts?: PlayTtsOptions) {
  stopTts()
  const content = text.trim()
  if (!content) return false

  const ctrl = new AbortController()
  pending = ctrl
  notify("loading")
  const run = opts?.fetch ?? fetch
  const url = `${base}/tts/speak`

  ttsLog("debug", "play start", {
    url,
    chars: content.length,
    authenticatedFetch: run !== fetch,
  })

  const fail = async (message?: string, tryBrowser = true, reason?: string) => {
    ttsLog("warn", "server playback failed", { message, reason, tryBrowser })
    if (tryBrowser) {
      const browser = await speakBrowser(content, ctrl.signal)
      if (browser) {
        pending = undefined
        return true
      }
    }
    opts?.onError?.(message ?? "Speech unavailable")
    stopTts()
    return false
  }

  try {
    const started = performance.now()
    const res = await run(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content }),
      signal: ctrl.signal,
    })
    const elapsed = Math.round(performance.now() - started)

    if (!res.ok) {
      const detail = await readError(res)
      ttsLog("warn", "server response not ok", { status: res.status, elapsed, detail })
      return fail(detail ?? `Server returned ${res.status}`, true, "http-error")
    }

    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg"
    const provider = res.headers.get("x-tts-provider") ?? "unknown"
    const data = await res.arrayBuffer()
    ttsLog("debug", "server audio received", {
      status: res.status,
      elapsed,
      mime,
      provider,
      bytes: data.byteLength,
    })

    if (ctrl.signal.aborted) return false
    if (data.byteLength < 16) return fail("Speech synthesis returned empty audio", true, "empty-body")

    const blobUrl = URL.createObjectURL(new Blob([data], { type: mime }))
    blob = blobUrl
    pending = undefined

    const el = new Audio()
    audio = el
    el.src = blobUrl

    await waitForAudio(el, ctrl.signal)

    if (ctrl.signal.aborted) {
      stopTts()
      return false
    }

    notify("playing")
    el.addEventListener("ended", () => stopTts(), { once: true })
    try {
      await el.play()
      ttsLog("debug", "html audio playing", { provider, mime })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to play audio"
      return fail(message, true, "audio-play-rejected")
    }
    return true
  } catch (err) {
    if (ctrl.signal.aborted) return false
    const message = err instanceof Error ? err.message : undefined
    ttsLog("error", "play threw", { message })
    return fail(message, true, "fetch-or-load-error")
  }
}
