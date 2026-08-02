import { Pause, Play } from "lucide-solid"
import { Show, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { formatMediaTime } from "@/lib/media-player"
import { useMediaPlayer } from "@/context/media-player"

export function MediaPlayerControls(props: { compact?: boolean }) {
  const player = useMediaPlayer()
  const track = createMemo(() => player.track())
  const max = createMemo(() => Math.max(player.duration(), 0))
  const value = createMemo(() => Math.min(player.current(), max() || player.current()))

  return (
    <Show when={track()}>
      {(current) => (
        <div
          classList={{
            "flex min-w-0 items-center gap-2": true,
            "w-full": !props.compact,
          }}
        >
          <Button
            variant="ghost"
            size="small"
            class="size-7 shrink-0 p-0"
            aria-label={player.playing() ? "Pause" : "Play"}
            onClick={() => player.toggle()}
          >
            <Show when={player.playing()} fallback={<Play class="size-3.5" />}>
              <Pause class="size-3.5" />
            </Show>
          </Button>
          <Show when={!props.compact}>
            <input
              type="range"
              min={0}
              max={max() || 0}
              step={0.1}
              value={value()}
              class="min-w-0 flex-1 accent-text-base"
              aria-label="Seek"
              onInput={(e) => player.seek(Number(e.currentTarget.value))}
            />
            <span class="text-10-regular text-text-weaker tabular-nums shrink-0">
              {formatMediaTime(player.current())}
              <Show when={max() > 0}>
                <span> / {formatMediaTime(max())}</span>
              </Show>
            </span>
          </Show>
          <Show when={props.compact}>
            <span class="text-11-regular text-text-base truncate min-w-0">{current().title}</span>
          </Show>
        </div>
      )}
    </Show>
  )
}
