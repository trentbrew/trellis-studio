import { Preview } from "./manager"

export type Health = {
  service: Preview.ServiceInfo
  expected: "any" | Preview.Status
  ok: boolean
  reachable: boolean
  url?: string
  status?: number
  error?: string
}

function url(info: Preview.ServiceInfo) {
  return info.url ?? (info.port ? `http://localhost:${info.port}` : undefined)
}

async function reachable(target: string, timeout: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(target, { signal: ctrl.signal })
    return { reachable: res.status < 500, status: res.status }
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

export async function check(info: Preview.ServiceInfo, expected: "any" | Preview.Status = "running", timeout = 2_500): Promise<Health> {
  const target = url(info)
  const probe = info.status === "running" && target ? await reachable(target, timeout) : { reachable: false }
  const ok = (expected === "any" || info.status === expected) && (info.status !== "running" || probe.reachable)
  return {
    service: info,
    expected,
    ok,
    reachable: probe.reachable,
    url: target,
    status: "status" in probe ? probe.status : undefined,
    error: "error" in probe ? probe.error : info.error,
  }
}

export function format(item: Health) {
  const parts = [
    item.ok ? "OK" : "NOT OK",
    item.service.name,
    `state=${item.service.status}`,
    `expected=${item.expected}`,
    item.url ? `url=${item.url}` : "url=none",
    item.service.pid ? `pid=${item.service.pid}` : "",
    item.status ? `http=${item.status}` : "",
    item.error ? `error=${item.error}` : "",
  ]
  return parts.filter(Boolean).join(" ")
}
