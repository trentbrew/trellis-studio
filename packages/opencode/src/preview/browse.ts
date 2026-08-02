import { injectBridge } from "./proxy"

const BLOCKED = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"])

export const NAV = `
(function() {
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    e.preventDefault();
    try {
      window.parent.postMessage({ source: 'oc-browse', url: href }, '*');
    } catch (err) {}
  }, true);
})();
`.trim()

/** Align `location.pathname` with the proxied page before SPA hydration (SvelteKit, etc.). */
export function locationShim(target: URL): string {
  const href = target.href.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `
(function() {
  try {
    var target = new URL("${href}");
    var path = target.pathname + target.search + target.hash;
    var current = location.pathname + location.search + location.hash;
    if (current !== path) history.replaceState(history.state, "", path);
  } catch (err) {}
})();
`.trim()
}

export function allowed(raw: string): URL | undefined {
  if (!URL.canParse(raw)) return
  const url = new URL(raw)
  if (!["http:", "https:"].includes(url.protocol)) return
  const host = url.hostname.toLowerCase()
  if (BLOCKED.has(host) || host.endsWith(".local")) return
  if (privateHost(host)) return
  return url
}

function privateHost(host: string): boolean {
  if (host === "metadata.google.internal" || host === "metadata.goog") return true
  if (host.startsWith("[")) {
    const inner = host.slice(1, -1).toLowerCase()
    if (inner === "::1") return true
    if (inner.startsWith("fc") || inner.startsWith("fd") || inner.startsWith("fe80")) return true
    return false
  }
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function injectBrowse(html: string, target: URL): string {
  const base = `<base href="${target.href.replace(/"/g, "%22")}">`
  const script = `<script>${locationShim(target)}\n${NAV}</script>`
  return injectBridge(html, base, script)
}
