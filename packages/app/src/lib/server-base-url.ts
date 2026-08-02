/**
 * Opencode API base URL for the current page.
 *
 * turtlecode serves Studio under `/<base64url(workspaceDir)>/…` and proxies API
 * calls using that prefix. Using `location.origin` alone drops the workspace
 * segment and breaks SSE/API in cloud sandboxes (E2B).
 */

const WORKSPACE_PREFIX_RE = /^\/([A-Za-z0-9_-]{10,})(?=\/|$)/

function decodeWorkspaceSegment(encoded: string): string | undefined {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const pad = (4 - (normalized.length % 4)) % 4
    const padded = normalized + "=".repeat(pad)
    const decoded = atob(padded)
    if (!decoded.startsWith("/") || /[^\x20-\x7e]/.test(decoded)) return undefined
    return decoded
  } catch {
    return undefined
  }
}

/** Matches turtlecode `extractDir` — only treat segment as workspace when it decodes to an absolute path. */
export function workspacePathPrefix(pathname: string): string | undefined {
  const match = pathname.match(WORKSPACE_PREFIX_RE)
  if (!match) return undefined
  const encoded = match[1]
  if (!decodeWorkspaceSegment(encoded)) return undefined
  return `/${encoded}`
}

export function serverBaseUrl(): string {
  if (typeof location === "undefined") return ""
  const prefix = workspacePathPrefix(location.pathname)
  if (!prefix) return location.origin
  return `${location.origin}${prefix}`
}
