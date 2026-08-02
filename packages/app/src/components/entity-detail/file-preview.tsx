import { createMemo, Show } from "solid-js"
import { DataProvider } from "@opencode-ai/ui/context"
import { File } from "@opencode-ai/ui/file"
import { AppMarkdown } from "@/components/app-markdown"
import type { FileContent } from "@opencode-ai/sdk/v2"
import { sampledChecksum } from "@opencode-ai/util/encode"
import { useSDK } from "@/context/sdk"
import { CsvViewer } from "@/pages/session/csv-editor"
import { isMd, isCsv, isVideo, isAudio, isImage, rawUrl } from "./helpers"

const STUB = {
  session: [],
  session_status: {},
  session_diff: {},
  message: {},
  part: {},
}

function normPath(p: string): string {
  return p.replaceAll("\\", "/").replace(/\/+/g, "/")
}

function resolveLink(base: string, href: string): string | undefined {
  const next = href.split("#")[0]?.split("?")[0]?.trim()
  if (!next) return
  if (/^(?:[a-z]+:|\/\/)/i.test(next)) return
  const full = normPath(next)
  if (full.startsWith("/")) return full.replace(/^\/+/, "")
  const out = normPath(base).split("/").slice(0, -1)
  for (const item of full.split("/")) {
    if (!item || item === ".") continue
    if (item === "..") {
      out.pop()
      continue
    }
    out.push(item)
  }
  return out.join("/")
}

export function FilePreview(props: {
  path: string
  file: FileContent | undefined
  onLinkClick?: (path: string) => void
}) {
  const sdk = useSDK()
  const text = createMemo(() => {
    if (!props.file || props.file.type !== "text" || props.file.encoding === "base64") return
    return props.file.content
  })
  const rich = createMemo(() => {
    const next = text()
    if (!next || !isMd(props.path)) return
    return next
  })
  const grid = createMemo(() => {
    const next = text()
    if (!next || !isCsv(props.path)) return
    return next
  })
  const video = createMemo(() => {
    if (!isVideo(props.path)) return
    return rawUrl(sdk.url, sdk.directory, props.path)
  })
  const audio = createMemo(() => {
    if (!isAudio(props.path)) return
    return rawUrl(sdk.url, sdk.directory, props.path)
  })
  const image = createMemo(() => {
    if (!isImage(props.path)) return
    return rawUrl(sdk.url, sdk.directory, props.path)
  })
  const sum = createMemo(() => sampledChecksum(props.file?.content ?? ""))
  const load = (path: string) =>
    sdk.client.file
      .read({ path })
      .then((x) => x.data)
      .catch(() => undefined)
  const read = async (path: string) => {
    const data = await load(path)
    if (!data || data.type !== "text" || data.encoding === "base64") return undefined
    return data.content
  }

  return (
    <Show
      when={props.file}
      fallback={
        <div class="rounded-md border border-border-base bg-background-base px-3 py-2 text-12-regular text-text-weak">
          Preview unavailable
        </div>
      }
    >
      {(data) => (
        <div class="bg-background-base overflow-hidden h-full flex flex-col">
          <Show
            when={rich()}
            fallback={
              <Show
                when={video()}
                fallback={
                  <Show
                    when={audio()}
                    fallback={
                      <Show
                        when={grid()}
                        fallback={
                          <Show when={image() && props.path.toLowerCase().endsWith(".svg")}>
                            {(src) => (
                              <div class="flex flex-col h-full">
                                <div class="flex-shrink-0 border-b border-border-base p-4">
                                  <div class="flex items-center justify-center bg-background-stronger rounded-lg p-4">
                                    <img
                                      src={src() as string}
                                      alt={props.path}
                                      class="max-h-64 max-w-full object-contain"
                                      onError={(e) => {
                                        const el = e.currentTarget as HTMLImageElement
                                        el.style.display = "none"
                                        el.parentElement!.innerHTML = `<div class="text-text-weak">Failed to load SVG</div>`
                                      }}
                                    />
                                  </div>
                                </div>
                                <div class="flex-1 overflow-auto entity-file-preview">
                                  <File
                                    mode="text"
                                    file={{
                                      name: props.path,
                                      contents: data().content,
                                      cacheKey: sum(),
                                    }}
                                    class="text-10-mono"
                                    media={{
                                      mode: "auto",
                                      path: props.path,
                                      current: data(),
                                      readFile: load,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </Show>
                        }
                      >
                        {(next) => (
                          <div class="h-full overflow-auto">
                            <CsvViewer value={next()} />
                          </div>
                        )}
                      </Show>
                    }
                  >
                    {(next) => (
                      <div class="h-full flex items-center justify-center bg-background-stronger px-6">
                        <audio src={next()} controls preload="metadata" class="w-full max-w-xl" />
                      </div>
                    )}
                  </Show>
                }
              >
                {(src) => (
                  <div class="h-full flex items-center justify-center bg-black">
                    <video
                      src={src()}
                      controls
                      autoplay
                      class="max-h-full max-w-full"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLVideoElement
                        el.style.display = "none"
                        el.parentElement!.innerHTML = `<div class="text-text-weak">Failed to load video</div>`
                      }}
                    />
                  </div>
                )}
              </Show>
            }
          >
            {(next) => (
              <DataProvider data={STUB} directory={sdk.directory} mediaUrl={sdk.url}>
                <div class="h-full overflow-auto px-3 py-2 entity-md-preview">
                  <AppMarkdown
                    text={next()}
                    cacheKey={sum()}
                    basePath={props.path}
                    onLinkClick={(href) => {
                      const resolved = resolveLink(props.path, href)
                      if (!resolved) return
                      props.onLinkClick?.(resolved)
                    }}
                    fileFetch={(href) => {
                      const resolved = resolveLink(props.path, href)
                      if (!resolved) return Promise.resolve(undefined)
                      return read(resolved)
                    }}
                  />
                </div>
              </DataProvider>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
