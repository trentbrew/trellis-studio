import type { FileContent } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createResource, Match, on, onCleanup, Show, Switch, type JSX } from "solid-js"
import { useI18n } from "../context/i18n"
import {
  dataUrlFromMediaValue,
  hasMediaValue,
  isBinaryContent,
  mediaKindFromPath,
  normalizeMimeType,
  svgTextFromValue,
} from "../pierre/media"

export type FileMediaOptions = {
  mode?: "auto" | "off"
  path?: string
  current?: unknown
  before?: unknown
  after?: unknown
  readFile?: (path: string) => Promise<FileContent | undefined>
  onLoad?: () => void
  onError?: (ctx: { kind: "image" | "audio" | "svg" | "pdf" | "font" }) => void
}

function mediaValue(cfg: FileMediaOptions, mode: "image" | "audio") {
  if (cfg.current !== undefined) return cfg.current
  if (mode === "image") return cfg.after ?? cfg.before
  return cfg.after ?? cfg.before
}

export function FileMedia(props: { media?: FileMediaOptions; fallback: () => JSX.Element }) {
  const i18n = useI18n()
  const cfg = () => props.media
  const kind = createMemo(() => {
    const media = cfg()
    if (!media || media.mode === "off") return
    return mediaKindFromPath(media.path)
  })

  const isBinary = createMemo(() => {
    const media = cfg()
    if (!media || media.mode === "off") return false
    if (kind()) return false
    return isBinaryContent(media.current as any)
  })

  const onLoad = () => props.media?.onLoad?.()

  const deleted = createMemo(() => {
    const media = cfg()
    const k = kind()
    if (!media || !k) return false
    if (k === "svg") return false
    if (media.current !== undefined) return false
    return !hasMediaValue(media.after as any) && hasMediaValue(media.before as any)
  })

  const mediaKinds = new Set(["image", "audio", "pdf", "font"] as const)
  type DirectKind = "image" | "audio" | "pdf" | "font"
  const isDirect = (k: string | undefined): k is DirectKind => mediaKinds.has(k as any)

  const direct = createMemo(() => {
    const media = cfg()
    const k = kind()
    if (!media || !isDirect(k)) return
    return dataUrlFromMediaValue(mediaValue(media, k === "pdf" || k === "font" ? "image" : k), k)
  })

  const request = createMemo(() => {
    const media = cfg()
    const k = kind()
    if (!media || !isDirect(k)) return
    if (media.current !== undefined && !isBinaryContent(media.current as any)) return
    if (deleted()) return
    if (direct()) return
    if (!media.path || !media.readFile) return

    return {
      key: `${k}:${media.path}`,
      kind: k,
      path: media.path,
      readFile: media.readFile,
      onError: media.onError,
    }
  })

  const [loaded] = createResource(
    request,
    async (input) => {
      return input.readFile(input.path).then(
        (result) => {
          const src = dataUrlFromMediaValue(result as any, input.kind)
          if (!src) {
            input.onError?.({ kind: input.kind })
            return { key: input.key, error: true as const }
          }

          return {
            key: input.key,
            src,
            mime: input.kind === "audio" ? normalizeMimeType(result?.mimeType) : undefined,
          }
        },
        () => {
          input.onError?.({ kind: input.kind })
          return { key: input.key, error: true as const }
        },
      )
    },
    { initialValue: undefined },
  )

  const remote = createMemo(() => {
    const input = request()
    const value = loaded.latest
    if (!input || !value || value.key !== input.key) return
    return value
  })

  const src = createMemo(() => {
    const value = remote()
    return direct() ?? (value && "src" in value ? value.src : undefined)
  })
  const status = createMemo(() => {
    if (direct()) return "ready" as const
    if (!request()) return "idle" as const
    if (loaded.loading) return "loading" as const
    if (remote()?.error) return "error" as const
    if (src()) return "ready" as const
    return "idle" as const
  })
  const audioMime = createMemo(() => {
    const value = remote()
    return value && "mime" in value ? value.mime : undefined
  })

  const svgSource = createMemo(() => {
    const media = cfg()
    if (!media || kind() !== "svg") return
    return svgTextFromValue(media.current as any)
  })
  const svgSrc = createMemo(() => {
    const media = cfg()
    if (!media || kind() !== "svg") return
    return dataUrlFromMediaValue(media.current as any, "svg")
  })
  const svgInvalid = createMemo(() => {
    const media = cfg()
    if (!media || kind() !== "svg") return
    if (svgSource() !== undefined) return
    if (!hasMediaValue(media.current as any)) return
    return [media.path, media.current] as const
  })

  createEffect(
    on(
      svgInvalid,
      (value) => {
        if (!value) return
        cfg()?.onError?.({ kind: "svg" })
      },
      { defer: true },
    ),
  )

  const kindLabel = (value: "image" | "audio") =>
    i18n.t(value === "image" ? "ui.fileMedia.kind.image" : "ui.fileMedia.kind.audio")

  return (
    <Switch>
      <Match when={kind() === "image" || kind() === "audio"}>
        <Show
          when={src()}
          fallback={(() => {
            const media = cfg()
            const k = kind()
            if (!media || (k !== "image" && k !== "audio")) return props.fallback()
            const label = kindLabel(k)

            if (deleted()) {
              return (
                <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                  {i18n.t("ui.fileMedia.state.removed", { kind: label })}
                </div>
              )
            }
            if (status() === "loading") {
              return (
                <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                  {i18n.t("ui.fileMedia.state.loading", { kind: label })}
                </div>
              )
            }
            if (status() === "error") {
              return (
                <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                  {i18n.t("ui.fileMedia.state.error", { kind: label })}
                </div>
              )
            }
            return (
              <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                {i18n.t("ui.fileMedia.state.unavailable", { kind: label })}
              </div>
            )
          })()}
        >
          {(value) => {
            const k = kind()
            if (k !== "image" && k !== "audio") return props.fallback()
            if (k === "image") {
              return (
                <div class="flex justify-center bg-background-stronger/0 px-6 py-4">
                  <img
                    src={value()}
                    alt={cfg()?.path}
                    class="max-h-[60vh] max-w-full rounded border border-border-weak-base bg-background-base object-contain"
                    onLoad={onLoad}
                  />
                </div>
              )
            }

            return (
              <div class="flex justify-center bg-background-stronger/0 px-6 py-4">
                <audio class="w-full max-w-xl" controls preload="metadata" onLoadedMetadata={onLoad}>
                  <source src={value()} type={audioMime()} />
                </audio>
              </div>
            )
          }}
        </Show>
      </Match>
      <Match when={kind() === "pdf"}>
        {(() => {
          const blobUrl = createMemo<string | undefined>((prev) => {
            const data = src()
            if (prev) URL.revokeObjectURL(prev)
            if (!data) return
            const match = data.match(/^data:([^;]+);base64,(.*)$/)
            if (!match) return
            const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
            return URL.createObjectURL(new Blob([bytes], { type: match[1] }))
          })
          onCleanup(() => {
            const url = blobUrl()
            if (url) URL.revokeObjectURL(url)
          })
          return (
            <Show
              when={blobUrl()}
              fallback={
                <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                  {status() === "loading" ? "Loading PDF\u2026" : "PDF preview unavailable"}
                </div>
              }
            >
              {(url) => (
                <div class="flex h-full min-h-[70vh] flex-col bg-background-stronger">
                  <iframe
                    src={url()}
                    class="h-full min-h-[70vh] w-full border-0"
                    title={cfg()?.path ?? "PDF"}
                    onLoad={onLoad}
                  />
                </div>
              )}
            </Show>
          )
        })()}
      </Match>
      <Match when={kind() === "font"}>
        {(() => {
          const url = src()
          if (!url) {
            return (
              <div class="flex min-h-40 items-center justify-center px-6 py-4 text-center text-text-weak">
                {status() === "loading" ? "Loading font…" : "Font preview unavailable"}
              </div>
            )
          }
          const family = `preview-${Date.now()}`
          const style = document.createElement("style")
          style.textContent = `@font-face { font-family: '${family}'; src: url('${url}'); }`
          document.head.appendChild(style)
          onCleanup(() => style.remove())
          return (
            <div class="flex flex-col items-center gap-6 bg-background-stronger px-6 py-8">
              <div class="text-14-regular text-text-weak">{cfg()?.path?.split("/").pop()}</div>
              <div style={{ "font-family": `'${family}'` }} class="text-center text-5xl leading-tight text-text-strong">
                ABCDEFGHIJKLM
                <br />
                NOPQRSTUVWXYZ
                <br />
                abcdefghijklm
                <br />
                nopqrstuvwxyz
                <br />
                0123456789
              </div>
              <div
                style={{ "font-family": `'${family}'` }}
                class="max-w-lg text-center text-lg leading-relaxed text-text-dimmed"
              >
                The quick brown fox jumps over the lazy dog.
              </div>
            </div>
          )
        })()}
      </Match>
      <Match when={kind() === "svg"}>
        {(() => {
          if (svgSource() === undefined && svgSrc() == null) return props.fallback()

          return (
            <div class="flex flex-col gap-4 px-6 py-4">
              <Show when={svgSource() !== undefined}>{props.fallback()}</Show>
              <Show when={svgSrc()}>
                {(value) => (
                  <div class="flex justify-center">
                    <img
                      src={value()}
                      alt={cfg()?.path}
                      class="max-h-[60vh] max-w-full rounded border border-border-weak-base bg-background-base object-contain"
                      onLoad={onLoad}
                    />
                  </div>
                )}
              </Show>
            </div>
          )
        })()}
      </Match>
      <Match when={isBinary()}>
        <div class="flex min-h-56 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <div class="text-14-semibold text-text-strong">
            {cfg()?.path?.split("/").pop() ?? i18n.t("ui.fileMedia.binary.title")}
          </div>
          <div class="text-14-regular text-text-weak">
            {(() => {
              const path = cfg()?.path
              if (!path) return i18n.t("ui.fileMedia.binary.description.default")
              return i18n.t("ui.fileMedia.binary.description.path", { path })
            })()}
          </div>
        </div>
      </Match>
      <Match when={true}>{props.fallback()}</Match>
    </Switch>
  )
}
