import type { CommitResponse, ManifestEntry, PublishError, UploadCredentialBatch } from "./types"

export type PublishVisibility = "public" | "unlisted"

export interface BrokerClientOptions {
  brokerUrl: string
  projectId: string
  authToken: string
  fetchImpl?: typeof fetch
}

export interface SlugCheckResult {
  slug: string
  available: boolean
  reason?: string
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export async function checkSlugAvailability(opts: BrokerClientOptions & { slug: string }): Promise<SlugCheckResult> {
  const f = opts.fetchImpl ?? fetch
  const params = new URLSearchParams({
    slug: opts.slug,
    projectId: opts.projectId,
  })
  const res = await f(`${baseUrl(opts.brokerUrl)}/publish/check?${params}`, { headers: authHeaders(opts.authToken) })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new BrokerError(res.status, parseBrokerError(body))
  }
  return {
    slug: String(body.slug ?? opts.slug),
    available: body.available === true,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  }
}

export async function beginPublish(
  opts: BrokerClientOptions & {
    slug: string
    manifest: ManifestEntry[]
    visibility?: PublishVisibility
    spaFallback?: boolean
  },
): Promise<UploadCredentialBatch> {
  const f = opts.fetchImpl ?? fetch
  const res = await f(`${baseUrl(opts.brokerUrl)}/project/${encodeURIComponent(opts.projectId)}/publish/begin`, {
    method: "POST",
    headers: authHeaders(opts.authToken),
    body: JSON.stringify({
      slug: opts.slug,
      manifest: opts.manifest,
      visibility: opts.visibility ?? "public",
      spaFallback: opts.spaFallback === true,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new BrokerError(res.status, parseBrokerError(body))
  }
  return body as unknown as UploadCredentialBatch
}

export async function commitPublish(
  opts: BrokerClientOptions & { slug: string; version: string },
): Promise<CommitResponse> {
  const f = opts.fetchImpl ?? fetch
  const res = await f(`${baseUrl(opts.brokerUrl)}/project/${encodeURIComponent(opts.projectId)}/publish/commit`, {
    method: "POST",
    headers: authHeaders(opts.authToken),
    body: JSON.stringify({
      slug: opts.slug,
      version: opts.version,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new BrokerError(res.status, parseBrokerError(body))
  }
  return { url: String(body.url) }
}

function parseBrokerError(body: Record<string, unknown>): PublishError & { error: string } {
  const err = body.error
  if (typeof err === "string") {
    return {
      error: err as PublishError["error"],
      message: typeof body.message === "string" ? body.message : undefined,
      limit: body.limit && typeof body.limit === "object" ? (body.limit as Record<string, number>) : undefined,
    }
  }
  return { error: "MANIFEST_MISMATCH", message: "publish request failed" }
}

export class BrokerError extends Error {
  readonly status: number
  readonly code: PublishError["error"] | string

  constructor(status: number, body: PublishError & { error: string }) {
    super(body.message ?? body.error)
    this.name = "BrokerError"
    this.status = status
    this.code = body.error
  }
}
