# Storage & Upload Contract

**Scope:** The wire-level contract between the studio backend (sandbox-side, TRL-7), the broker (TRL-6), and the published-artifact router ([cloud/publish-router/](../../../../cloud/publish-router/), TRL-4). This is the spec everyone implements against.

**Status:** Locked for v1 by TRL-5. Any change to the path scheme, credential shape, or retention rules opens a new issue — these are load-bearing for every other part of the pipeline.

---

## 1. Path scheme

```
publish/{tenant}/{slug}/{version}/{relativePath}
```

| Segment | Meaning | Source of truth |
| --- | --- | --- |
| `publish/` | Static literal prefix. Distinguishes published artifacts from any future R2 use. | This doc |
| `{tenant}` | Opaque tenant identifier (e.g. `t_abc123`). Never the human handle. | Broker / InstantDB |
| `{slug}` | Lowercased, validated public slug (TRL-3). | Broker registry |
| `{version}` | Content-addressed hash of the artifact tree (see §2). | Sandbox at upload time |
| `{relativePath}` | Path inside the build output directory, joined with `/`. | Manifest |

**Path constraints:**

- All segments are lowercase ASCII. Multi-byte characters are rejected at the manifest stage, not at R2.
- `relativePath` has no leading slash, no `..`, no `./`. Manifest construction normalizes and validates.
- Total key length (including `publish/...`) is capped at 1024 chars — R2's S3 object key limit.

**Why content-addressed versions:** republishing identical output is a no-op flip — the broker sees the same `version`, sees the slug already points there, and just returns the existing URL. No re-upload, no new R2 objects.

---

## 2. Version hash

```
version = "sha256-" + hex(sha256(canonicalManifestJson))
```

Where `canonicalManifestJson` is the JSON serialization of the **sorted** manifest entry list:

```jsonc
[
  { "path": "assets/app.abc123.js", "size": 12345, "sha256": "..." },
  { "path": "favicon.ico", "size": 318, "sha256": "..." },
  { "path": "index.html", "size": 2014, "sha256": "..." }
]
```

Rules:

- Entries sorted by `path` (UTF-8 byte order, lexicographic).
- JSON serialization: no whitespace, no trailing comma, keys in fixed order `path → size → sha256`.
- The hash covers metadata, not file contents — but each entry's `sha256` is the file's content hash, so the manifest hash transitively binds the entire artifact.

This produces a deterministic, content-addressed version string. Two identical builds → identical version → no-op republish.

---

## 3. Publish flow (wire-level)

```
sandbox                          broker                       R2
  │                                │                          │
  │  POST /publish/begin           │                          │
  │  { tenant, slug, manifest }    │                          │
  ├───────────────────────────────►│                          │
  │                                │ validate slug + manifest │
  │                                │ generate presigned URLs  │
  │  { uploads, expiresAt,         │                          │
  │    version }                   │                          │
  │◄───────────────────────────────┤                          │
  │                                │                          │
  │  PUT each file (parallel)      │                          │
  ├──────────────────────────────────────────────────────────►│
  │  ... N requests ...            │                          │
  │◄──────────────────────────────────────────────────────────┤
  │                                │                          │
  │  POST /publish/commit          │                          │
  │  { tenant, slug, version }     │                          │
  ├───────────────────────────────►│ verify all keys exist    │
  │                                │ flip KV pointer          │
  │  { url, milestoneId }          │                          │
  │◄───────────────────────────────┤                          │
```

### 3.1 Step semantics

**`POST /publish/begin`** is idempotent on `(tenant, slug, version)`. Calling it again with the same manifest returns the same credential set (until expiry); the broker never issues two credential sets for the same version concurrently.

**Direct sandbox→R2 PUTs** are the only step that scales with artifact size. The broker is out of the hot path; its bandwidth stays flat regardless of publish volume.

**`POST /publish/commit`** is the atomicity point. The broker checks every key in the manifest actually landed in R2 (`HEAD` each, in parallel) before flipping the slug pointer. If any object is missing, commit fails and the prior live version stays live.

### 3.2 What if the sandbox dies mid-upload?

Half-uploaded artifact = orphan objects in R2 under that `version` prefix. They cost storage but never serve traffic (slug pointer was never flipped). Background retention sweep (§6) cleans them up after N days.

The sandbox can retry the whole publish: same manifest produces the same version, broker returns the same credential set, sandbox PUTs only the files that are missing (it can `HEAD` first to skip ones already there — optional optimization for v2).

---

## 4. Credential shape

```ts
export interface UploadCredentialBatch {
  kind: 'r2-presigned-batch'

  // The content-addressed version this batch is for. Sandbox must use this
  // when constructing the commit request — it is not allowed to invent its own.
  version: string

  // Per-relative-path upload instructions. The map key is the relative path
  // inside the artifact (matches manifest entries 1:1). The URL is presigned
  // and pre-bound to the correct R2 object key.
  uploads: Record<string, PresignedUpload>

  // ISO 8601 timestamp. The sandbox MUST refuse to start uploading if this is
  // within 60 seconds — too tight a window risks partial uploads expiring.
  expiresAt: string
}

export interface PresignedUpload {
  url: string                       // signed PUT URL
  method: 'PUT'
  headers?: Record<string, string>  // headers signed into the URL (e.g. content-type)
}
```

**Why presigned URLs per file** rather than a single bucket-scoped credential:

- R2 does not have prefix-scoped temporary credentials as of v1 (no STS analog).
- Long-lived account-level R2 access keys can't be safely handed to a sandbox.
- Presigned URLs are per-object and per-method, so a leaked URL can only overwrite one key. Blast radius is bounded.
- The broker enforces all the policy (path layout, content-type, max size per file, max files per publish) at signing time. The sandbox cannot deviate.

**Future migration** to a single scoped credential (e.g. if R2 ships prefix-scoped tokens) is a provider-side change. The `kind` discriminator in `UploadCredentialBatch` lets us add `'r2-scoped-token'` without breaking the sandbox-side uploader contract.

---

## 5. Limits (enforced by broker at `/publish/begin`)

| Limit | v1 value | Rationale |
| --- | --- | --- |
| Max files per publish | 2,000 | A typical Vite build has 50–500 files. 2k is generous; protects R2 from abusive manifests. |
| Max bytes per file | 25 MB | Static sites don't ship large blobs. Larger files belong in R2 directly or elsewhere. |
| Max total artifact size | 100 MB | Per-publish ceiling. Raises with paid tiers later. |
| Active versions retained per slug | 5 (current + 4 prior) | Enough to roll back across iteration; not enough to be a storage drag. |
| Credential lifetime | 1 hour | Long enough for slow networks on large builds; short enough to limit credential exposure. |

Limit violations are rejected at `/publish/begin` with structured error codes:

```jsonc
{
  "error": "MANIFEST_TOO_LARGE",
  "limit": { "maxFiles": 2000, "actualFiles": 4128 }
}
```

Error codes used by the sandbox uploader to render actionable messages in the UI (TRL-9 / TRL-10):

- `MANIFEST_TOO_LARGE` — too many files
- `FILE_TOO_LARGE` — a single file over 25 MB
- `ARTIFACT_TOO_LARGE` — total over 100 MB
- `SLUG_TAKEN` — slug already owned by another tenant
- `SLUG_RESERVED` — see slug-policy.md §2
- `SLUG_INVALID` — fails regex or other policy
- `CREDENTIAL_EXPIRED` — sandbox tried to use a credential past `expiresAt`
- `MANIFEST_MISMATCH` — commit-time manifest doesn't match what `/begin` was called with

---

## 6. Retention policy

### Per-slug

```
keep   = { current live version }            ∪ { last 4 prior versions }
expire = everything else, after 7 days of being non-live
```

Five versions total (current + 4 prior). The 7-day grace lets a user republish-then-realize-they-want-the-old-one for a week. After that, the artifact is reclaimable.

### After unpublish

Per [slug-policy.md §5](./slug-policy.md), an unpublished slug enters a 30-day cooldown before it's available to other tenants. During that cooldown:

- All artifacts for that slug are retained (the owner can re-publish to flip the same KV pointer back live instantly).
- After cooldown, all artifacts under `publish/{tenant}/{slug}/` become eligible for deletion.

### After takedown (TRL-14)

Takedown locks the slug and removes the live KV pointer. Artifacts remain in R2 for **90 days** (audit + appeal window), then are purged. The slug stays locked indefinitely.

### Orphan sweep

Half-uploaded artifacts (R2 objects under a `version` prefix that was never committed via `/publish/commit`) are deleted after **3 days**. Identified by: no slug record in KV references the version, but R2 objects exist under that path.

### Implementation

Retention is a daily background job in the broker — not in the publish flow. The publish flow must stay fast (sub-3-second goal); GC happens out of band.

```
broker cron daily:
  for each tenant:
    for each slug:
      list versions in R2
      load KV record (current live version)
      delete:
        - non-live versions older than 7d, except the 4 most recent
        - all versions of unpublished slugs past 30d cooldown
        - all versions of taken-down slugs past 90d retention
        - orphan versions (no `/commit` record) older than 3d
```

### Costs (sanity check against §3.3 of publishing.md)

5 versions × 5 MB per version × 100k active slugs = 2.5 TB total R2 storage.
2.5 TB × $0.015/GB-month = $38/month. Still trivial.

---

## 7. Implementation pointers

- **Sandbox-side uploader:** [studio/packages/opencode/src/publish/upload.ts](../../opencode/src/publish/upload.ts) (TRL-5)
- **Sandbox-side manifest:** [studio/packages/opencode/src/publish/manifest.ts](../../opencode/src/publish/manifest.ts) (TRL-5)
- **Broker `/publish/begin` + `/publish/commit`:** TRL-6, lives under `cloud/src/publish/` (not yet created)
- **R2 read path:** [cloud/publish-router/](../../../../cloud/publish-router/) (TRL-4, done)

The sandbox uploader knows nothing about R2 specifically — it consumes a `UploadCredentialBatch` and PUTs each file. Swapping R2 for another provider is a broker-side change.

---

## 8. What this contract intentionally does NOT cover

- **Slug allocation / validation** — that's [slug-policy.md](./slug-policy.md) + TRL-6.
- **Build step** — getting from project source to a `dist/` directory is `studio/packages/opencode/src/preview/infer.ts` + the publish module orchestration (TRL-7).
- **UI flow** — TRL-8 (control), TRL-9 (popover), TRL-10 (progress).
- **Auth between sandbox and broker** — relies on the existing broker auth machinery used by every other studio→cloud call.
- **CDN behavior** — handled by Cloudflare Workers + cache headers set by the router (TRL-4 `serve.ts`).
