import { DataProvider } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, type ParentProps, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { LocalProvider } from "@/context/local"
import { SDKProvider } from "@/context/sdk"
import { TrellisProvider } from "@/context/trellis"
import { TrellisStoreProvider } from "@/context/trellis-store"
import { EntityDialogProvider } from "@/components/entity-dialog"
import { SyncProvider, useSync } from "@/context/sync"
import { JobBridge } from "@/components/status-bar/job-bridge"
import { GraphPreloadTrigger } from "@/components/graph-preload-trigger"
import { decode64 } from "@/utils/base64"
import { animate } from "motion"
import { useGlobalSDK } from "@/context/global-sdk"
import { useBusySessionPoll } from "@/hooks/use-busy-session-poll"
import { WhiteboardEmbedProvider } from "@/components/whiteboard-embed-provider"
import { sessionRouteHref } from "@/pages/session/helpers"
import { MediaPlayerScope } from "@/context/media-player"
import { NowPlayingBadge } from "@/components/now-playing-badge"
import { PreviewBadge } from "@/components/preview-badge"

function DirectoryDataProvider(props: ParentProps<{ directory: string }>) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const sdk = useGlobalSDK()
  const slug = createMemo(() => base64Encode(props.directory))

  createEffect(() => {
    const next = sync.data.path.directory
    if (!next || next === props.directory) return
    const path = location.pathname.slice(slug().length + 1)
    navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, { replace: true })
  })

  createEffect(() => {
    const id = params.id
    if (!id) return
    void sync.session.sync(id)
  })

  useBusySessionPoll()

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      mediaUrl={sdk.url}
      mediaFetch={sdk.fetch}
      onNavigateToSession={(sessionID: string) => navigate(sessionRouteHref(slug(), sessionID))}
      onSessionHref={(sessionID: string) => sessionRouteHref(slug(), sessionID)}
    >
      <WhiteboardEmbedProvider>
        <LocalProvider>
          <NowPlayingBadge />
          <PreviewBadge />
          <EntityDialogProvider>{props.children}</EntityDialogProvider>
        </LocalProvider>
      </WhiteboardEmbedProvider>
    </DataProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const language = useLanguage()
  const navigate = useNavigate()
  let invalid = ""

  const resolved = createMemo(() => {
    if (!params.dir) return ""
    return decode64(params.dir) ?? ""
  })

  createEffect(() => {
    const dir = params.dir
    if (!dir) return
    if (resolved()) {
      invalid = ""
      return
    }
    if (invalid === dir) return
    invalid = dir
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={resolved()} keyed>
      {(resolved) => (
        <SDKProvider directory={() => resolved}>
          <TrellisStoreProvider>
            <TrellisProvider>
              <GraphPreloadTrigger />
              <SyncProvider>
                <JobBridge />
                <MediaPlayerScope>
                  <div
                    class="size-full"
                    ref={(el) =>
                      requestAnimationFrame(() =>
                        animate(el as Element, { opacity: [0, 1], y: [4, 0] }, {
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        } as any),
                      )
                    }
                  >
                    <DirectoryDataProvider directory={resolved}>{props.children}</DirectoryDataProvider>
                  </div>
                </MediaPlayerScope>
              </SyncProvider>
            </TrellisProvider>
          </TrellisStoreProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
