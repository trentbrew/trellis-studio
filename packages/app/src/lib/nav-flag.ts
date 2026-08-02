// Single source of truth for the "nav v2" feature flag.
// Spec: /specs/navigation-ia.md
//
// Enable:   localStorage.setItem("trellis_nav_v2", "true") then refresh.
// Rollback: localStorage.removeItem("trellis_nav_v2") then refresh.
//
// Read once at component creation. Toggling the flag at runtime requires a
// page refresh — keep the mental model simple, no live-reactive flag.

export function isNavV2Enabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem("trellis_nav_v2") === "true"
  } catch {
    return false
  }
}
