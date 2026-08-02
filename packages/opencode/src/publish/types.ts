// Wire-level types shared between the broker and the sandbox uploader.
// See studio/packages/docs/plans/storage-contract.md for the authoritative spec.

export interface ManifestEntry {
  path: string // relative to artifact root, "/"-joined, no leading slash
  size: number // bytes
  sha256: string // hex
  contentType: string
}

export interface UploadCredentialBatch {
  kind: "r2-presigned-batch"
  version: string
  uploads: Record<string, PresignedUpload>
  expiresAt: string
}

export interface PresignedUpload {
  url: string
  method: "PUT"
  headers?: Record<string, string>
}

export interface BeginRequest {
  tenant: string
  slug: string
  manifest: ManifestEntry[]
}

export interface BeginResponse extends UploadCredentialBatch {}

export interface CommitRequest {
  tenant: string
  slug: string
  version: string
}

export interface CommitResponse {
  url: string
  milestoneId?: string
}

// Errors the broker returns at /publish/begin. The sandbox renders messages
// from these codes; the human-readable text lives in i18n on the studio side.
export type PublishErrorCode =
  | "MANIFEST_TOO_LARGE"
  | "FILE_TOO_LARGE"
  | "ARTIFACT_TOO_LARGE"
  | "SLUG_TAKEN"
  | "SLUG_RESERVED"
  | "SLUG_INVALID"
  | "CREDENTIAL_EXPIRED"
  | "MANIFEST_MISMATCH"

export interface PublishError {
  error: PublishErrorCode
  limit?: Record<string, number>
  message?: string
}

// Limits per storage-contract.md §5 — enforced at the broker but mirrored here
// so the sandbox can fail fast before hitting the network.
export const LIMITS = {
  maxFiles: 2_000,
  maxBytesPerFile: 25 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
} as const
