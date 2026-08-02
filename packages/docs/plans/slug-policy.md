# Slug Namespace Policy

**Scope:** Rules governing public slugs under `*.studio.trellis.computer` — the wildcard domain that hosts every published artifact (TRL-4). This document is the source of truth referenced by the broker registry (TRL-6) and the first-publish popover (TRL-9).

**Status:** Locked for v1 by TRL-3. Future revisions belong in their own issues, not edits to this doc without ID.

---

## 1. Slug shape (locked, v1)

```
^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$
```

Rules in plain language:

- **Charset:** lowercase ASCII letters, digits, hyphen. No uppercase, no underscores, no Unicode, no dots.
- **Length:** 3 to 63 characters inclusive. 63 is the DNS label limit; we lean into it rather than picking an arbitrary tighter cap.
- **Boundaries:** must start and end with a letter or digit. No leading or trailing hyphens.
- **Interior hyphens:** allowed, including consecutive (`fractions--game`), because DNS allows them. The UI should *visually discourage* `--` runs (subtle inline hint) but the broker accepts them.
- **All-digit slugs:** forbidden. A slug like `12345` reads as an IP-fragment or test artifact and creates ambiguity in logs. Require at least one letter.
- **Confusables:** out of scope for v1. The charset already excludes Unicode lookalikes; trademark impersonation is handled reactively via takedown (TRL-14), not preemptively.

**Recommended UI rendering** (for TRL-9): live-validate on input, show one of:

| State | Inline hint |
| --- | --- |
| Valid + available | `✓ available` |
| Valid + taken | `✗ taken — try another` (with suggestion) |
| Too short / too long | `between 3 and 63 characters` |
| Invalid character | `letters, numbers, and hyphens only` |
| Leading/trailing hyphen | `can't start or end with a hyphen` |
| All digits | `must include at least one letter` |
| Reserved | `that name is reserved` |
| Profanity-flagged | `pick a different name` *(generic — never quote the flag)* |

---

## 2. Reserved subdomains (locked, v1)

The following names are non-claimable. The list is conservative — it's much easier to release a reserved name later than to take one back from a user.

**Service & infrastructure** (already in production or planned):

```
api, studio, www, app, mail, cdn, assets, static, media,
ftp, smtp, ns, ns1, ns2, mx, dns, webmail
```

**Auth & admin:**

```
admin, administrator, login, logout, signup, signin, signout,
auth, oauth, sso, account, accounts, register, password,
forgot, reset, verify, confirm, billing, invoice, payment, payments
```

**Ops & status:**

```
status, health, metrics, logs, dashboard, monitor, monitoring,
analytics, telemetry, ops, internal, infra
```

**Environment names** (prevent confusion in URLs and logs):

```
dev, develop, development, staging, stage, qa, test, testing,
beta, alpha, preview, sandbox, prod, production, demo
```

**TLS, ACME, & DNS plumbing:**

```
_acme-challenge, acme, ssl, cert, tls, _dmarc, _spf, _domainkey
```

**Marketing, legal, support** (we will want these subdomains):

```
about, help, support, contact, legal, tos, terms, privacy,
pricing, careers, jobs, press, security, abuse, takedown,
blog, news, docs, documentation, guide, guides, learn, tutorial
```

**Trellis brand & product:**

```
trellis, studio, opencode, turtlecode, cloud, hub, garden,
issue, issues, milestone, milestones, branch, branches
```

**Common impersonation targets** (the short head — full anti-phishing list is reactive):

```
apple, google, microsoft, amazon, paypal, stripe, github,
gitlab, vercel, cloudflare, instagram, facebook, twitter, x,
tiktok, openai, anthropic, claude
```

**Generic high-risk:**

```
root, system, null, undefined, void, default, none, error,
unknown, anonymous, guest
```

### Implementation note

Ship this as a single `Set<string>` in the broker. Check after normalizing the input (lowercase, trim). Do not split on hyphens — `apple-store` is allowed, only the exact label `apple` is reserved.

```ts
// Sketch only — implementation belongs to TRL-6.
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // ... categories above, deduplicated
])

function isReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}
```

---

## 3. Profanity filtering (locked, v1)

**Decision: use [`obscenity`](https://www.npmjs.com/package/obscenity).** TypeScript-native, runs in-process (no API latency, no third-party data egress), false-positive-aware via whitelist patterns, handles common evasion (leet substitution, character padding).

Alternatives considered and rejected:

- **PurgoMalum / similar HTTP APIs** — adds latency to slug validation, creates a runtime dependency on an external service, and ships user-entered text off-platform. For an education context that's a privacy regression.
- **Static word list, hand-maintained** — initial bar is low but the long tail (leet, padding, partial matches) gets unmanageable. `obscenity` already encodes those patterns.
- **No filter** — every public education platform that's shipped without one has regretted it. The path of least pain is "ship it muted" then tune false positives in.

### Behavior

1. Run `obscenity` against the lowercased slug **after** reserved-list check.
2. On flag: reject with the generic message `pick a different name`. **Never quote the matched term back to the user** (avoids reinforcing patterns and avoids surfacing false positives in a way that invites bypass attempts).
3. Log the flag (broker-side) with hashed slug + match category for audit and tuning. Do not log the raw slug to prevent the audit table from becoming a slur archive.
4. Maintain a project-specific whitelist for known false positives (`scunthorpe`-class words). Start empty; add as reports come in.

### Limits

`obscenity` does not catch every clever evasion. It is one layer, not the whole defense:

- **Layer 1:** reserved list (this doc, §2)
- **Layer 2:** profanity filter (this section)
- **Layer 3:** reactive takedown + slug lock (TRL-14)
- **Layer 4:** teacher moderation surface (TRL-15)

Each layer compensates for the others' gaps.

---

## 4. Tenant scoping & fallback (v1: none)

**Decision: no automatic tenant fallback in v1.** The namespace is global-flat. If a slug is taken, the first-publish popover (TRL-9) shows "taken — try another" with a suggestion (next available numeric suffix, e.g. `fractions-game-2`).

### Why no fallback in v1

1. **Wildcard cert reality.** The TLS cert covers `*.studio.trellis.computer` — one DNS label deep. A nested form like `slug.tenant.studio.trellis.computer` would need either a deeper wildcard (`*.*.studio.trellis.computer`, which most CAs don't issue) or per-tenant cert provisioning. Not worth the operational tax for v1.
2. **The compound form** (`tenant-slug.studio.trellis.computer`) reads worse than picking a different slug. `acme-fractions-game.studio.trellis.computer` is uglier than `acme-fractions.studio.trellis.computer` (a name the user could have picked themselves).
3. **Teacher mental model.** The teacher persona wants `mrs-smiths-fractions.studio.trellis.computer`, not `mrs-smiths.acme.studio.trellis.computer`. Global-flat matches the mental model.
4. **Premature.** Slug exhaustion isn't a v1 problem. Reserve namespace via the reserved list; revisit if collisions get common.

### Documented v2 path (for when it matters)

If we later need tenant scoping, the supported form is **`{tenant-prefix}-{slug}`** (single DNS label, compound separator). Reasons:

- Works under the existing `*.studio.trellis.computer` wildcard cert (no infrastructure change).
- Linear DNS label, no second-level wildcard required.
- `tenant-prefix` is a stable opaque token (≤ 8 chars, e.g. `acme1`), not the human tenant name — keeps slugs readable.

This is documented, not built. Anyone implementing it should open a new issue.

---

## 5. Ownership & reclamation (locked, v1)

### Acquisition

- A slug is acquired by the first tenant who successfully calls `POST /publish` with that slug.
- Once acquired, the slug is owned by that tenant for as long as the tenant exists and the slug remains in their project list (whether or not it's currently published).
- Acquisition is atomic at the broker — duplicate-name races resolve to whichever request commits first.

### Release & reclamation

| Event | Slug state | Available to others? |
| --- | --- | --- |
| Owner clicks **Unpublish** (UI) | Released by owner | After **30-day cooldown** |
| Owner deletes the project | Released | After **30-day cooldown** |
| Tenant deleted / abandoned (no activity in N days, where N is set elsewhere) | Released | After **90-day cooldown** |
| Slug taken down by moderation (TRL-14) | Locked | **Never** (until manual review unlocks) |

### Why cooldowns

The 30-day cooldown prevents drive-by re-registration ("type-squat someone's just-unpublished URL"). The 90-day cooldown on abandoned tenants gives users a real recovery window if they come back. The takedown lock is non-reclaimable because the cases that produce takedowns (CSAM, impersonation, malware) should not be re-exposed by another tenant claiming the same name.

### Transfer

Slug transfer between tenants is **not supported in v1**. If a teacher wants their old class slug, they republish it from their current tenant — the cooldown allows this within the owner's own tenant immediately. Cross-tenant transfer is a v2+ concern.

### Reclamation by owner during cooldown

The original owner can re-acquire their own slug at any time during the cooldown window — the cooldown is only against *other* tenants. Republishing your own unpublished slug is instant.

---

## 6. Operational notes

- **Broker is the authority.** The sandbox never validates slugs directly. Validation happens once at `POST /publish` (TRL-6); the UI does optimistic feedback via a debounced `GET /publish/check?slug=…` (TRL-9), but the broker's response is the only one that matters.
- **Cooldown enforcement** is a DB-level constraint (a `releasedAt` timestamp on the slug record; `available = releasedAt < now() - cooldown OR previousOwner == requestingTenant`). Don't background-job it; just query it.
- **Reserved list changes** require a code change to the broker. Don't make it a config table — keeping it in source means it gets code-reviewed and PR-discussed before names get released to the wild.
- **Audit** every slug acquisition, release, and takedown. The audit table is the source of truth for "who had this name when," which matters for moderation and disputes.

---

## 7. Open questions deferred past TRL-3

Not blockers for downstream issues; flagged here so they aren't forgotten:

- **Multi-language profanity coverage.** `obscenity` is primarily English. If Trellis ships to non-English markets, layer-2 needs revisiting.
- **Trademark / impersonation policy** beyond the reserved-list short head. Likely a takedown SOP (TRL-14) rather than preemptive filtering, but no policy doc yet.
- **Free-tier slug limit** (e.g. 5 active slugs per free tenant). Decided in TRL-6 (broker), referenced here for completeness.
- **Slug analytics** (which slugs are claimed but never published, which are squatted-looking). Defer to v1.5+.
