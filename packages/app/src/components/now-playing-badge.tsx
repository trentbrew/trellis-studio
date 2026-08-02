import { Pause, Play } from "lucide-solid"
import { Show, createMemo } from "solid-js"
import { Portal } from "solid-js/web"
import { useSearchParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { trackLabel } from "@/lib/media-player"
import { useMediaPlayer } from "@/context/media-player"

export function NowPlayingBadge() {
  const player = useMediaPlayer()
  const [, setSearchParams] = useSearchParams()

  const mount = createMemo(() => document.getElementById("opencode-titlebar-right"))
  const label = createMemo(() => trackLabel(player.track()))

  const open = () => {
    const track = player.track()
    if (!track) return
    setSearchParams({
      view: "assets",
      section: "audio",
      asset: track.path,
    })
  }

  return (
    <Show when={mount() && label()}>
      <Portal mount={mount()!}>
        <div class="now-playing-badge" title={label()}>
          <Button
            variant="ghost"
            size="small"
            class="now-playing-badge-toggle size-6 shrink-0 p-0"
            aria-label={player.playing() ? "Pause" : "Play"}
            onClick={() => player.toggle()}
          >
            <Show when={player.playing()} fallback={<Play class="size-3" />}>
              <Pause class="size-3" />
            </Show>
          </Button>
          <button type="button" class="now-playing-badge-label" onClick={open}>
            {label()}
          </button>
        </div>
      </Portal>
    </Show>
  )
}
