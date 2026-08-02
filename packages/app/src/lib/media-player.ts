export type MediaTrack = {
  src: string
  title: string
  path: string
}

export function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const whole = Math.floor(seconds)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function trackLabel(track: MediaTrack | undefined) {
  if (!track) return undefined
  const title = track.title.trim()
  if (title) return title
  const leaf = track.path.split(/[/\\]/).pop()
  return leaf || track.path
}
