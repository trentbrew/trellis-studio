// Trellis Cloud feature flag for the IDE.
// Active when the app is iframed by the cloud dashboard (`?cloud=1` query param
// or any embedded context). When active:
//  - Project picker is suppressed (cloud dashboard owns project lifecycle).
//  - Multi-project switcher and "Open project" / "New project" controls hide.
//  - "Exit to Trellis Cloud" affordance posts a message to the parent frame.

export function isCloudMode(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (window.self !== window.top) return true
  } catch {
    // cross-origin iframes throw; treat as cloud mode.
    return true
  }
  return new URLSearchParams(window.location.search).has("cloud")
}

export function cloudWorkspaceSlug(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("workspace")
}

export function exitToCloud(): void {
  if (typeof window === "undefined") return
  try {
    window.parent.postMessage({ type: "trellis-cloud:exit" }, "*")
  } catch {
    // noop — best effort
  }
}

/** Notify the cloud shell parent to match dock chrome (OC-2 light/dark). */
export function notifyCloudColorMode(mode: "light" | "dark"): void {
  if (typeof window === "undefined" || !isCloudMode()) return
  try {
    window.parent.postMessage({ type: "trellis-cloud:color-mode", mode }, "*")
  } catch {
    // cross-origin parent
  }
}

/**
 * Returns the broker API origin for cloud mode.
 * In production, the broker is co-hosted with the cloud dashboard.
 * In dev, override with `?broker=http://localhost:8787`.
 */
export function cloudBrokerUrl(): string | null {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  const explicit = params.get("broker")
  if (explicit) return explicit.replace(/\/+$/, "")
  // In an iframe, the broker origin is typically the parent origin
  try {
    if (window.self !== window.top && document.referrer) {
      const referrer = new URL(document.referrer)
      return referrer.origin
    }
  } catch {
    // cross-origin — can't read referrer
  }
  // Fallback: same origin
  return window.location.origin
}
