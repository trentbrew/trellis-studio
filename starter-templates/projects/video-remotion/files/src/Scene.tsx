import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

const title = "{{name}}"

export function MainVideo() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 18 } })
  const opacity = interpolate(frame, [0, 24, 150, 180], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #141414 0%, #23404a 48%, #f4b860 100%)",
        color: "white",
        display: "flex",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity,
          textAlign: "center",
          transform: `translateY(${interpolate(enter, [0, 1], [48, 0])}px)`,
        }}
      >
        <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: 0, marginBottom: 28 }}>Trellis Video</div>
        <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: 0, lineHeight: 1 }}>{title}</div>
        <div style={{ fontSize: 34, marginTop: 34, opacity: 0.86 }}>Scripted scenes, assets, and renders</div>
      </div>
    </AbsoluteFill>
  )
}
