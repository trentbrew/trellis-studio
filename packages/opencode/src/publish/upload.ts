import type { PresignedUpload, UploadCredentialBatch } from "./types"

export interface UploadOptions {
  credential: UploadCredentialBatch
  files: Record<string, Uint8Array>
  concurrency?: number
  retries?: number
  onProgress?: (done: number, total: number) => void
  // Test seam — pass a custom fetch implementation in tests.
  fetchImpl?: typeof fetch
  // Wall-clock now() for credential expiry check; testable.
  now?: () => Date
}

export interface UploadOk {
  ok: true
  uploaded: string[]
}

export interface UploadErr {
  ok: false
  failed: Array<{ path: string; status?: number; error: string }>
  uploaded: string[]
}

export type UploadResult = UploadOk | UploadErr

// Consumes an UploadCredentialBatch and PUTs every file in `files` to its
// presigned URL. Returns once everything is uploaded or an unrecoverable
// failure occurs. Does not flip any pointer — the caller (publish module,
// TRL-7) issues the /publish/commit call after this resolves OK.
export async function uploadArtifact(opts: UploadOptions): Promise<UploadResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = (opts.now ?? (() => new Date()))()
  const concurrency = Math.max(1, opts.concurrency ?? 8)
  const retries = Math.max(0, opts.retries ?? 2)
  const onProgress = opts.onProgress

  // Per storage-contract.md §4: refuse to start within 60s of expiry.
  const expires = new Date(opts.credential.expiresAt)
  const slackMs = 60 * 1000
  if (expires.getTime() - now.getTime() < slackMs) {
    return {
      ok: false,
      uploaded: [],
      failed: [{ path: "<batch>", error: "CREDENTIAL_EXPIRED" }],
    }
  }

  const queue = Object.entries(opts.credential.uploads)
  const total = queue.length
  const uploaded: string[] = []
  const failed: UploadErr["failed"] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= queue.length) return
      const [relPath, upload] = queue[i]!
      const body = opts.files[relPath]
      if (!body) {
        failed.push({ path: relPath, error: "FILE_MISSING_LOCAL" })
        continue
      }
      const result = await putWithRetry(fetchImpl, relPath, upload, body, retries)
      if (result.ok) {
        uploaded.push(relPath)
      } else {
        failed.push(result.err)
      }
      onProgress?.(uploaded.length + failed.length, total)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  await Promise.all(workers)

  if (failed.length === 0) return { ok: true, uploaded }
  return { ok: false, uploaded, failed }
}

async function putWithRetry(
  fetchImpl: typeof fetch,
  relPath: string,
  upload: PresignedUpload,
  body: Uint8Array,
  retries: number,
): Promise<{ ok: true } | { ok: false; err: { path: string; status?: number; error: string } }> {
  let attempt = 0
  let lastStatus: number | undefined
  let lastError = "UNKNOWN"
  while (attempt <= retries) {
    try {
      // Reconstruct a Blob each retry — some fetch impls consume the body.
      const res = await fetchImpl(upload.url, {
        method: upload.method,
        body: new Blob([new Uint8Array(body).buffer as ArrayBuffer]),
        headers: upload.headers,
      })
      if (res.ok) return { ok: true }
      lastStatus = res.status
      lastError = `HTTP_${res.status}`
      // 4xx (except 408/429) is not worth retrying — credential or signature issue.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    attempt++
    if (attempt <= retries) {
      await sleep(backoffMs(attempt))
    }
  }
  return { ok: false, err: { path: relPath, status: lastStatus, error: lastError } }
}

function backoffMs(attempt: number): number {
  // 200ms, 600ms, 1.4s — caps quickly to keep the publish UI responsive.
  return Math.min(2000, 200 * Math.pow(3, attempt - 1))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
