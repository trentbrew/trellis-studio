import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect, on, onCleanup, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { MediaTrack } from "@/lib/media-player"
import { useSDK } from "./sdk"

type MediaPlayerStore = {
  track?: MediaTrack
  playing: boolean
  current: number
  duration: number
}

export const { use: useMediaPlayer, provider: MediaPlayerProvider } = createSimpleContext({
  name: "MediaPlayer",
  init: () => {
    const sdk = useSDK()
    let audio: HTMLAudioElement | undefined

    const [store, setStore] = createStore<MediaPlayerStore>({
      track: undefined,
      playing: false,
      current: 0,
      duration: 0,
    })

    const sync = () => {
      if (!audio) return
      setStore({
        current: audio.currentTime || 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        playing: !audio.paused,
      })
    }

    const bind = (node: HTMLAudioElement) => {
      audio = node
      const onTime = () => sync()
      const onMeta = () => sync()
      const onPlay = () => setStore("playing", true)
      const onPause = () => setStore("playing", false)
      const onEnded = () => {
        setStore({ playing: false, current: 0 })
      }

      node.addEventListener("timeupdate", onTime)
      node.addEventListener("loadedmetadata", onMeta)
      node.addEventListener("durationchange", onMeta)
      node.addEventListener("play", onPlay)
      node.addEventListener("pause", onPause)
      node.addEventListener("ended", onEnded)

      onCleanup(() => {
        node.removeEventListener("timeupdate", onTime)
        node.removeEventListener("loadedmetadata", onMeta)
        node.removeEventListener("durationchange", onMeta)
        node.removeEventListener("play", onPlay)
        node.removeEventListener("pause", onPause)
        node.removeEventListener("ended", onEnded)
        if (audio === node) audio = undefined
      })
    }

    const stop = () => {
      if (!audio) {
        setStore({ track: undefined, playing: false, current: 0, duration: 0 })
        return
      }
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
      setStore({ track: undefined, playing: false, current: 0, duration: 0 })
    }

    const play = (track: MediaTrack) => {
      if (!audio) return
      const same = store.track?.path === track.path
      setStore("track", track)
      if (!same || audio.src !== track.src) {
        audio.src = track.src
        audio.load()
      }
      void audio.play().catch(() => setStore("playing", false))
    }

    const pause = () => {
      audio?.pause()
    }

    const toggle = () => {
      if (!audio || !store.track) return
      if (audio.paused) void audio.play().catch(() => setStore("playing", false))
      else audio.pause()
    }

    const seek = (time: number) => {
      if (!audio) return
      audio.currentTime = time
      sync()
    }

    createEffect(
      on(
        () => sdk.directory,
        (_dir, prev) => {
          if (prev === undefined) return
          stop()
        },
      ),
    )

    return {
      track: () => store.track,
      playing: () => store.playing,
      current: () => store.current,
      duration: () => store.duration,
      bind,
      play,
      pause,
      toggle,
      stop,
      seek,
      active: (path: string) => store.track?.path === path,
    }
  },
})

export function MediaPlayerHost() {
  const player = useMediaPlayer()
  return <audio ref={player.bind} preload="metadata" class="sr-only" aria-hidden="true" />
}

export function MediaPlayerScope(props: ParentProps) {
  return (
    <MediaPlayerProvider>
      <MediaPlayerHost />
      {props.children}
    </MediaPlayerProvider>
  )
}
