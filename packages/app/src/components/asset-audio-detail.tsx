import { Pause, Play, Music } from "lucide-solid"
import { Show, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { formatMediaTime } from "@/lib/media-player"
import { useMediaPlayer } from "@/context/media-player"

export function AssetAudioDetail(props: { asset: { path: string; name: string; title?: string }; src: string }) {
  const player = useMediaPlayer()
  const isActive = createMemo(() => player.track()?.path === props.asset.path)
  const max = createMemo(() => Math.max(player.duration(), 0))
  const value = createMemo(() => Math.min(player.current(), max() || player.current()))

  const handlePlay = () => {
    player.play({
      src: props.src,
      title: props.asset.title || props.asset.name,
      path: props.asset.path,
    })
  }

  return (
    <div class="flex flex-col items-center gap-3 text-text-weaker p-4 w-full bg-surface-raised-base rounded-lg border border-border-weaker-base">
      <Music class="size-12 opacity-40" />
      <Show
        when={isActive()}
        fallback={
          <Button variant="primary" class="w-full flex items-center justify-center gap-2" onClick={handlePlay}>
            <Play class="size-4 fill-current" />
            Play Track
          </Button>
        }
      >
        <div class="w-full flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="small"
              class="size-8 shrink-0 p-0"
              aria-label={player.playing() ? "Pause" : "Play"}
              onClick={() => player.toggle()}
            >
              <Show when={player.playing()} fallback={<Play class="size-4 fill-current" />}>
                <Pause class="size-4 fill-current" />
              </Show>
            </Button>
            <input
              type="range"
              min={0}
              max={max() || 0}
              step={0.1}
              value={value()}
              class="min-w-0 flex-1 accent-text-base cursor-pointer"
              aria-label="Seek"
              onInput={(e) => player.seek(Number(e.currentTarget.value))}
            />
          </div>
          <div class="flex justify-between text-10-regular text-text-weaker tabular-nums px-1">
            <span>{formatMediaTime(player.current())}</span>
            <Show when={max() > 0}>
              <span>{formatMediaTime(max())}</span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
