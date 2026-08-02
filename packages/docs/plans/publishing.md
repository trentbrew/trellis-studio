# Publish Feature Architecture

**Recommendation:** Ship Trellis Studio's "publish" as a provider-pluggable pipeline rooted in Cloudflare R2 + a single wildcard Worker, with sandbox/Sprite VMs reserved for future full-runtime publishes. R2 wins over Vercel Blob primarily on egress (zero vs metered) — the long-tail cost of viral student/teacher content makes Blob unsafe at the education scale this product targets.

---

## 1. User answers (locked in)

- **Scope:** Whole project → single site under a subdomain.
- **Runtime:** Tiered — static first, light backend next, full runtime last. Provider-abstracted.
- **Sprite relationship:** Architectural recommendation requested.
- **Domain:** `<slug>.studio.trellis.computer` in v1; BYO custom domain in v2.

## 2. Recommendation: **Cloudflare-primary, Sprite-deferred**

### 2.1 Why not the alternatives

- **Vercel Blob + Edge Middleware** — appealing "same vendor as `cloud/`" story, but Blob meters egress at ~$0.05/GB. The education workload includes long-tail viral content (one student's game on TikTok, one teacher's site shared district-wide); that's the exact shape that turns Blob into an unbounded cost surface. See §3.3 cost model.
- **One Vercel deployment per publish** — slow per-publish provisioning, expensive, ops-heavy, leaks "powered by Vercel" on public URLs.
- **Railway** — optimized for always-on services; overkill and expensive for the static-majority catalog the teacher persona will produce. Revisit for Tier 3 only.
- **sprites.dev / child sprites per publish** — couples publish uptime to tenant sprite, cold starts hurt "one click to live," and per-tenant sprite quotas in the control plane make it scale-hostile. Sprite = IDE workbench, not CDN.
- **Same-sprite public routes (proxy E2B preview to a public URL)** — cheapest in the short term but an _availability trap_: sandbox sleeps → every published artifact goes dark. Violates TELOS §IV.2.

### 2.2 Why Cloudflare wins for v1

- SST is already Cloudflare-homed (`infra/app.ts`). Zero new provider onboarding.
- **R2 egress-free** — students hammering a math game on phones is free. The hard cost ceiling matters more for a presumed-free education tier than provider-affinity does.
- **Workers wildcard routing** — one Worker at `*.studio.trellis.computer` can serve every published site with slug → snapshot lookup in KV/D1.
- **<3s publish-to-live** is realistic: upload `dist/` to R2, flip pointer, done. No edge cache purge, no build queue.
- Natural growth path: same Worker gets smarter (Tier 2 — Workers bindings for KV/D1/AI), then a separate Sprite provider plugs in (Tier 3) without changing the UI or the Trellis data model.

### 2.3 Where the sandbox stays canonical

The E2B sandbox (or Sprite, in the future) remains the tenant **IDE VM** — the place builds run and previews are served from `https://{port}-{sandboxId}.e2b.dev`. It is not a publish target in v1, and only becomes one in Tier 3 when a user publishes an artifact that genuinely needs a long-running server. The build step *runs in* the sandbox but its output is uploaded out to R2 immediately, so artifact lifetime is decoupled from VM lifetime.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  studio/packages/opencode (IDE backend, runs in sandbox)     │
│                                                              │
│  Preview-panel [Publish] ──► POST /publish                   │
│                         (packages/opencode/src/server/routes)│
│                              │                               │
│                              ▼                               │
│           packages/opencode/src/publish/                     │
│           ├── index.ts        (orchestration)                │
│           ├── provider.ts     (interface + registry)         │
│           ├── providers/                                     │
│           │   ├── cloudflare.ts  (v1 default)                │
│           │   ├── sprite.ts      (v3 stub)                   │
│           │   └── vercel-blob.ts (optional escape hatch)     │
│           ├── build.ts        (reuse preview/infer.ts)       │
│           └── milestone.ts    (bind publish → Trellis)       │
└─────────────────────────┬────────────────────────────────────┘
                          │ snapshot upload (scoped credential)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare                                                  │
│                                                              │
│  R2 bucket: studio-publish                                   │
│     publish/<tenant>/<slug>/<version>/…static files…         │
│                                                              │
│  KV/D1: slug → current version pointer                       │
│                                                              │
│  Worker at *.studio.trellis.computer:                        │
│    host → slug → version → R2 fetch → serve                  │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │ tenant/slug registry
┌─────────────────────────┴────────────────────────────────────┐
│  cloud/ broker (Vercel + InstantDB)                          │
│  - owns tenant ↔ sandbox mapping                             │
│  - owns slug registry (prevents squatting across tenants)    │
│  - issues short-lived R2 upload credentials to the sandbox   │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Data flow (v1, static)

1. User clicks **Publish** in the preview-panel header; popover asks for slug on first publish only.
2. `POST /publish` (studio backend) → `publish/cloudflare.ts`.
3. Reuse `studio/packages/opencode/src/preview/infer.ts` to detect static HTML vs buildable project.
4. If buildable, run the detected build command (`bun run build`, `npm run build`, etc.) in the sandbox. Static-only = no build.
5. Walk `dist/` (or the static root), request a short-lived scoped R2 upload credential from the broker, stream files to `publish/<tenant>/<slug>/<version>/`.
6. Create a **Trellis milestone** with type `publish` linking slug + R2 path + version hash (reuses existing milestone/op log = free version history).
7. Flip the KV pointer `slug → version`. Propagation is global-edge in <1s.
8. Return `https://<slug>.studio.trellis.computer` to the UI.

### 3.2 Rollback

"Roll back" = flip KV pointer to a prior version. Zero rebuild, <1s. Surface as a flyout in the publish menu sourced from the Trellis milestones linked to that slug. See TRL-13.

### 3.3 Cost model (R2 vs Vercel Blob)

Modeled at three active-publish counts. Assumptions per published site:

- **Artifact size:** 5 MB build output (typical Vite/Next-static project)
- **Retained versions:** 3 (current + 2 prior, for rollback)
- **Traffic per site/month, baseline:** 100 unique visits × 500 KB warm-cache hit ≈ 50 MB egress
- **Viral tail:** assume 1 in 1,000 sites hits 1 M visits × 500 KB = 500 GB egress in a single month

Public pricing snapshot (2026-05; verify before locking budgets):

| Resource | Cloudflare R2 | Vercel Blob |
| --- | --- | --- |
| Storage | $0.015 / GB-month | $0.023 / GB-month |
| Egress | **$0** | $0.05 / GB |
| Class-A ops (writes) | $4.50 / M | included |
| Class-B ops (reads) | $0.36 / M | included |
| Router | Workers $5/mo + $0.30/M req | Edge Middleware (Pro plan) |

**Steady-state monthly cost** (storage + baseline egress, no viral):

| Active publishes | R2 storage | R2 egress | R2 total | Blob storage | Blob egress | Blob total |
| --- | --- | --- | --- | --- | --- | --- |
| 1,000 | $0.23 | $0 | **~$5** (Worker base) | $0.35 | $2.50 | **~$3** |
| 10,000 | $2.25 | $0 | **~$8** | $3.45 | $25 | **~$29** |
| 100,000 | $22.50 | $0 | **~$35** | $34.50 | $250 | **~$285** |

R2 is more expensive at small N (Worker base cost dominates) but linear-flat in egress while Blob scales linearly. Crossover happens around 3k–4k active publishes.

**Viral-tail cost** (one site goes viral in a given month):

| Provider | 1 viral site / month | 10 viral sites / month |
| --- | --- | --- |
| R2 | +$0 | +$0 |
| Blob | +$25 | +$250 |

This is the real argument. Education content is precisely the workload that spikes unpredictably (one teacher tweets, one student's game gets shared in a classroom Discord). With R2 the platform absorbs viral hits silently; with Blob, virality is a billing event. For a presumed-free education tier, that's a hard no.

**Conclusion:** R2 + Worker. Blob remains plumbed as an escape hatch (`providers/vercel-blob.ts`) for teams that want it, but not the default.

### 3.4 Storage & upload contract

The wire-level contract between sandbox, broker, and R2 — path scheme, credential shape, upload mechanics, error codes, and retention — is specified in **[storage-contract.md](./storage-contract.md)** (TRL-5). The sandbox-side implementation lives at [studio/packages/opencode/src/publish/](../../opencode/src/publish/) (`manifest.ts`, `upload.ts`, `mime.ts`, `types.ts`).

Quick orientation:

- **Path scheme:** `publish/{tenant}/{slug}/{version}/{relativePath}`
- **Version:** SHA-256 of the canonical manifest JSON — content-addressed, deterministic
- **Credential:** broker issues a batch of per-file presigned R2 URLs at `/publish/begin`
- **Commit:** broker verifies all keys landed, then atomically flips the KV pointer at `/publish/commit`
- **Limits:** 2,000 files, 25 MB/file, 100 MB/artifact (v1)
- **Retention:** current + 4 prior versions, 7-day grace, then GC'd by a daily broker cron

### 3.5 Provider interface

The `provider.ts` interface is the seam that lets Tier 2/3 add backends without changing the orchestration layer or UI.

```ts
// studio/packages/opencode/src/publish/provider.ts

export interface PublishProvider {
  readonly name: 'cloudflare-r2' | 'vercel-blob' | 'sprite'

  // Ask the broker for a short-lived credential the sandbox uses to upload
  // artifacts directly to the storage backend. Scoped to one publish.
  issueUploadCredential(params: {
    tenant: string
    slug: string
    version: string
  }): Promise<UploadCredential>

  // Atomically point the slug at a version. Must be globally consistent
  // within seconds (KV propagation is fine; DB row flip is fine).
  setLiveVersion(params: {
    tenant: string
    slug: string
    version: string
  }): Promise<void>

  // List versions for the rollback UI. Newest first.
  listVersions(params: {
    tenant: string
    slug: string
  }): Promise<PublishedVersion[]>

  // Remove the slug→version pointer. Does NOT delete versioned artifacts;
  // retention policy handles cleanup. User-initiated unpublish.
  unpublish(params: {
    tenant: string
    slug: string
  }): Promise<void>

  // Admin/moderation force-remove (TRL-14). Locks the slug from re-publishes
  // until reviewed. Returns prior live version for forensics.
  takedown(params: {
    tenant: string
    slug: string
    reason: string
  }): Promise<{ removedVersion: string | null }>
}

export interface UploadCredential {
  // Discriminator so the sandbox knows how to use the credential.
  kind: 'r2-s3' | 'blob-token' | 'sprite-rsync'

  // Where to upload to. For R2 this is the S3-compatible endpoint; for Blob
  // it's the Blob API base; for sprite it's the rsync target host.
  endpoint: string

  // Object-key prefix the credential is scoped to. The sandbox must not
  // upload outside this prefix; the broker enforces it on the credential.
  // Always {tenant}/{slug}/{version}.
  pathPrefix: string

  // ISO timestamp. The sandbox should refuse to start uploading if this
  // would expire mid-upload.
  expiresAt: string

  // Provider-specific credential payload. Opaque to the orchestration layer.
  credential: Record<string, unknown>
}

export interface PublishedVersion {
  version: string             // content hash, e.g. sha256:abc123…
  createdAt: string           // ISO timestamp
  size: number                // total bytes across all files
  fileCount: number
  isLive: boolean             // true iff slug pointer currently points here
  trellisMilestoneId?: string // links to the Trellis op-log entry
}
```

Notes on the contract:

- **Upload happens sandbox→storage directly.** The broker only issues the credential; it never streams artifacts. This keeps broker bandwidth flat regardless of publish volume.
- **Single scoped credential per publish, not per-file.** A Vite build is hundreds of files; per-file presigned URLs would round-trip the broker hundreds of times. R2's S3-compat lets us issue one credential bounded to a key prefix; Blob's token model is similar. The interface keeps the shape provider-agnostic but assumes single-credential semantics.
- **`version` is opaque to the interface** but should be content-addressed in practice (sha256 of the artifact tree) so republishing identical output is a no-op flip.
- **`setLiveVersion` is the atomicity point.** Implementations must make this transactional — never half-published. For R2/KV, that's a single KV write; for Blob, an InstantDB row flip.
- **`takedown` is distinct from `unpublish`.** Unpublish is reversible by the owner; takedown is moderator-locked and surfaces in audit logs (TRL-14).

---

## 4. Tiered capability plan

| Tier                  | Shipping target | Host                                         | Trigger                                                                                                     |
| --------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **1 — Static**        | v1              | R2 + Worker                                  | Default; any project that produces a static build or is HTML-first.                                         |
| **2 — Light backend** | v1.5            | Workers with bindings (KV, D1, AI proxy)     | Project declares `publish.runtime: "worker"` in `opencode.jsonc`, or detection finds edge-runtime handlers. |
| **3 — Full runtime**  | v2              | Sprite child VM (or Railway as escape hatch) | Project requires long-running Node/Bun/Docker. Provider plugin chosen at publish time.                      |

Tiers share:

- One UI (`Publish` button, same dialog)
- One backend API (`/publish`)
- One Trellis-milestone data model
- Provider abstraction at `packages/opencode/src/publish/provider.ts` so adding Tier 3 is _additive_, not a rewrite.

---

## 5. v1 implementation outline

All work scoped to studio/ + one new broker endpoint in cloud/. No UI rewrites beyond wiring the new publish control into the existing preview panel (TRL-8).

### 5.1 This repo

- **New module** `studio/packages/opencode/src/publish/` with `index.ts`, `provider.ts`, `providers/cloudflare.ts`, `build.ts`, `milestone.ts`. Interface defined in §3.5. Sandbox-side helpers (`manifest.ts`, `upload.ts`, `mime.ts`, `types.ts`) landed in TRL-5.
- **New route** `POST /publish` in `studio/packages/opencode/src/server/routes/publish.ts` (OpenAPI + zod, following the existing route style).
- **New route** `GET /publish/history` returning slug + versions for the rollback flyout (TRL-13).
- **Preview-panel wiring**: new state-aware publish control in `studio/packages/app/src/pages/session/preview-panel.tsx` and `browser-panel.tsx` (TRL-8). First-publish popover at TRL-9.
- **Context**: new `studio/packages/app/src/context/publish.tsx` (fetch helpers, active-job tracking, status polling).
- **i18n**: new `publish.*` keys; rename existing `session.share.*` "Publish on web" → "Share session" (TRL-1) before introducing the new strings.
- **Reuse `preview/infer.ts`** for framework detection so local preview and publish share one brain.
- **Tests**: colocated tests for provider interface, one fake provider, snapshot diffing. Reuse `packages/opencode/test/preview/` style.

### 5.2 Broker (cloud/)

- New `POST /project/:id/publish` endpoint that, given a tenant + slug, returns a short-lived scoped R2 upload credential + the slug registry decision (TRL-6). This is the _only_ cross-repo change; the sandbox never holds Cloudflare API keys.
- Slug uniqueness enforced here (InstantDB is the source of truth). Slug policy lives in TRL-3.

### 5.3 Infra

- New R2 bucket: `studio-publish`.
- New Worker: [cloud/publish-router/](../../../../cloud/publish-router/) bound to `*.studio.trellis.computer` (TRL-4). KV (`PUBLISH_KV`) for `slug → version` pointer; one R2 bucket binding (`PUBLISH_BUCKET`). KV value shape:

  ```jsonc
  // key:   slug:fractions-game
  {
    "tenant": "t_abc123",
    "version": "sha256-deadbeef...",
    "spaFallback": false,
    "reportFooter": true
  }
  ```

  Broker writes this on every successful publish; rollback is a re-write with a prior version string.
- Deploy steps (human-in-the-loop) documented in [cloud/publish-router/README.md](../../../../cloud/publish-router/README.md).

---

## 6. Non-goals for v1

- Custom domains (deferred to v2 with the Pro tier in TELOS §IX Boulder 6).
- Per-artifact URLs (user chose whole-project scope; defer the multi-URL graph story).
- Authenticated / gated published sites.
- Analytics on published artifacts.
- Sprite-based runtime publishes.
- Vercel/Railway providers (the abstraction allows them; we do not ship them).

---

## 7. Resolved decisions

- **Domain (locked):** `<slug>.studio.trellis.computer`. Aligns with the existing production setup (broker at `api.studio.trellis.computer`, web at `studio.trellis.computer`).
- **Storage backend (locked):** Cloudflare R2 + Worker for v1. Vercel Blob remains plumbed as `providers/vercel-blob.ts` but is not the default. Rationale: §3.3 cost model — egress is the only cost dimension where Blob is meaningfully worse, and education content has a viral long tail that makes that dimension load-bearing.
- **Milestone coupling (locked):** every publish creates a Trellis milestone, so the op log is the version truth. Rollback = flip pointer to a prior milestone's R2 path.

## 7.1 Decisions still open (defer past TRL-2)

- **Slug namespace policy:** resolved in TRL-3. See [slug-policy.md](./slug-policy.md) for the locked rules (regex, reserved list, profanity filter, ownership lifetime).
- **Free-tier publish limits:** suggest 5 active published projects per free tenant, unlimited republishes — cheap to enforce via KV counter, matches TELOS §IV.5. Final call belongs to TRL-6 (broker) since that's where it's enforced.

## 8. Risks and mitigations

- **Cloudflare lock-in** — mitigated by `provider.ts` abstraction (§3.5); swapping to a different static host is a single new provider implementation, no orchestration or UI changes.
- **Broker ↔ sandbox coupling** — the broker must be reachable to issue upload credentials. Mitigate by caching short-lived credentials for the duration of one publish and surfacing a clear error UI on failure.
- **Build step failures in-sandbox** — never break the currently-live published version on a failed republish (TRL-7 AC). Stream build logs to the existing preview console (TRL-10), not a toast.
- **Slug squatting** — handled by the broker registry (TRL-3, TRL-6). No sandbox-side enforcement.
- **Viral hits + cost** — R2's zero egress neutralizes this for v1. If we ever switch a tenant to Blob, monitor egress per slug and rate-limit at the router.
- **Education UGC moderation** — every public page carries a Report link injected by the router (TRL-14); broker exposes a takedown API distinct from owner-initiated unpublish (provider interface §3.5).

## 9. Trellis issue index

See live status via `trellis issue list`. v1 (label `publish-v1`): TRL-1 through TRL-11. v1.5 backlog (label `publish-v1.5`): TRL-12 through TRL-15.
