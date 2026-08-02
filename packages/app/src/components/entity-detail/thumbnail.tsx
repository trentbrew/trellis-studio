import { createMemo, createResource, For, Match, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { useSDK } from "@/context/sdk"
import { isImage, isVideo, rawUrl } from "./helpers"

export function FileThumbnail(props: { path: string; type: "file" | "directory"; class?: string }) {
  const sdk = useSDK()

  const [list] = createResource(
    () => (props.type === "directory" ? props.path : undefined),
    async (next) => {
      try {
        return (await sdk.client.file.list({ path: next })).data ?? []
      } catch {
        return []
      }
    },
    { initialValue: [] },
  )

  const [file] = createResource(
    () => (props.type === "file" && !isImage(props.path) ? props.path : undefined),
    async (next) => {
      try {
        return (await sdk.client.file.read({ path: next })).data
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const text = createMemo(() => {
    const f = file.latest
    if (!f || f.type !== "text" || f.encoding === "base64") return
    return f.content
  })
  const snippet = createMemo(() => {
    const raw = text()
    if (!raw) return
    return raw.split("\n").slice(0, 24).join("\n").slice(0, 1200)
  })
  const imageSrc = createMemo(() =>
    props.type === "file" && isImage(props.path) ? rawUrl(sdk.url, sdk.directory, props.path) : undefined,
  )
  const videoSrc = createMemo(() =>
    props.type === "file" && isVideo(props.path) ? rawUrl(sdk.url, sdk.directory, props.path) : undefined,
  )

  return (
    <div class="bg-gradient-to-b from-black to-black h-full w-full opacity-75">
      <div
        class={`relative w-full h-full overflow-hidden rounded-sm bg-background-base text-text-weak ${props.class ?? ""}`}
        style={{ "pointer-events": "none" }}
      >
        <Switch fallback={<IconFallback path={props.path} type={props.type} />}>
          <Match when={props.type === "directory"}>
            <DirectoryStack list={list.latest ?? []} />
          </Match>
          <Match when={imageSrc()}>
            {(src) => (
              <img
                src={src()}
                alt=""
                class="block size-full object-cover"
                loading="lazy"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                }}
              />
            )}
          </Match>
          <Match when={videoSrc()}>
            {(src) => (
              <video
                src={src()}
                class="block size-full object-cover"
                preload="metadata"
                muted
                playsinline
                onError={(e) => {
                  ;(e.currentTarget as HTMLVideoElement).style.display = "none"
                }}
              />
            )}
          </Match>
          <Match when={snippet()}>
            {(text) => (
              <pre class="absolute inset-0 m-0 overflow-hidden whitespace-pre p-1.5 font-mono text-[8px] leading-[1.25] text-text-weak">
                {text()}
              </pre>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  )
}

function DirectoryStack(props: { list: { type: string; path: string }[] }) {
  const total = () => props.list.length
  const sample = () => props.list.slice(0, 9)
  return (
    <Show
      when={total() > 0}
      fallback={
        <div class="absolute inset-0 flex items-center justify-center text-text-weaker">
          <Icon name="folder" size="medium" />
        </div>
      }
    >
      <div class="absolute inset-0 grid grid-cols-3 gap-px p-1.5">
        <For each={sample()}>
          {(child) => (
            <div class="flex items-center justify-center rounded-[2px] bg-surface-raised-base/40">
              <Show
                when={child.type === "directory"}
                fallback={<FileIcon node={{ path: child.path, type: "file" }} class="size-3" />}
              >
                <Icon name="folder" size="small" class="text-icon-weak" />
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="absolute bottom-1 right-1 rounded-sm bg-background-base/80 px-1 py-0.5 text-[9px] font-medium text-text-weak">
        {total()}
      </div>
    </Show>
  )
}

function IconFallback(props: { path: string; type: "file" | "directory" }) {
  return (
    <div class="absolute inset-0 flex items-center justify-center">
      <Show when={props.type === "file"} fallback={<Icon name="folder" size="medium" class="text-icon-weak" />}>
        <FileIcon node={{ path: props.path, type: "file" }} class="size-6" />
      </Show>
    </div>
  )
}
