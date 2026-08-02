# Tiptap Convert API — validation harness

Two-phase empirical validation of Tiptap's `/v2/convert/export/pdf` endpoint against Turtlecode's extended markdown schema. This harness exists to decide whether Tiptap Convert can replace the in-IDE PDF export, **before** we commit any implementation work.

See plan: `tiptap-convert-validation` (local Windsurf plan).

---

## Files

- `export.ts` — Bun script. Reads a Tiptap JSON doc + credentials, POSTs to the API, writes the PDF.
- `phase1-stress.json` — Hand-crafted doc covering every Turtlecode custom node + a standard-node control group. Used to answer "does the API gracefully handle our custom nodes?"
- `phase2-real.json` — (gitignored) Real Tiptap JSON extracted from a live editor session. Created during Phase 2.
- `.output/` — (gitignored) Generated PDFs.

## Prerequisites

1. Tiptap cloud account with Convert app configured: https://cloud.tiptap.dev/v2/cloud/convert
2. Credentials in `.env.tiptap-convert` at repo root (gitignored):

   ```env
   TIPTAP_CONVERT_APP_ID=your-app-id-here
   TIPTAP_CONVERT_JWT=your-jwt-here
   # Optional override (default https://api.tiptap.dev)
   # TIPTAP_CONVERT_URL=https://api.tiptap.dev
   ```

   The JWT is typically short-lived — mint a new one if you hit 401s.

## Dry run (no creds needed)

Validates env + input parsing + body construction without calling the API:

```bash
bun script/tiptap-convert/export.ts \
  --input script/tiptap-convert/phase1-stress.json \
  --dry-run
```

Expected: prints input path, node count, request body preview, exits 0.

## Phase 1 — stress test

```bash
bun --env-file=.env.tiptap-convert script/tiptap-convert/export.ts \
  --input script/tiptap-convert/phase1-stress.json \
  --output script/tiptap-convert/.output/phase1-stress.pdf
```

Expected: HTTP 200, `application/pdf`, file written. If non-200, the response body is dumped (first 2000 chars) for inspection.

Then open the PDF and score each section visually:

- **Section 1 (control group)** — standard Tiptap nodes should all render correctly. If anything here fails, the API itself is misconfigured and the test is invalid.
- **Section 2 (Turtlecode custom nodes)** — per node, mark one of:
  - **OK** — renders visually equivalent to our editor.
  - **Degraded** — renders but with missing styling/icons/layout.
  - **Raw** — custom shell dropped, child content rendered as plain text.
  - **Dropped** — node and its children completely missing from PDF.
  - **Error** — API returned 4xx/5xx referencing this node.

### Nodes under test in Phase 1

| Node                         | Shape in JSON                                                                 | Expected Tiptap Convert behaviour |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `frontmatter`                | Atom w/ `raw`, `meta`                                                         | Unknown — likely dropped          |
| `callout` (5 types)          | Block w/ `type` attr + block+ content                                         | Unknown — likely dropped          |
| `codeBlock` `language=mermaid` | Standard code block                                                          | Renders as code (no mermaid SVG) |
| `image`                      | Standard Tiptap image w/ `src`                                                | Absolute URL renders; relative 404s |
| `mention`                    | Inline atom w/ `type`, `id`, `label`                                          | Tiptap has stock mention; custom attrs may or may not round-trip |
| `embed`                      | Atom w/ `src`                                                                 | Unknown — likely dropped          |
| Table w/ headers + cells     | Standard Tiptap `table`/`tableRow`/`tableHeader`/`tableCell`                  | Should render with borders        |
| Task list w/ checked state   | Standard `taskList`/`taskItem`                                                | Should render                     |
| Inline link mark             | Standard `link` mark                                                          | Should render                     |

### Decision gate after Phase 1

See plan §"Decision gate after Phase 1" — four outcomes, each mapped to a next step.

## Phase 2 — real document (run only if Phase 1 is promising)

Two options for getting a real Tiptap JSON:

### Option A: devtools extraction (least invasive, recommended)

Temporarily adds `window.__tiptap = editor` in `MarkdownEditor.onMount`, gated by `import.meta.env.DEV`. In the running app:

1. Open a complex markdown file (e.g. `PATENT_BRIEF.md`).
2. In devtools console: `copy(JSON.stringify(window.__tiptap.getJSON(), null, 2))`
3. Paste into `script/tiptap-convert/phase2-real.json`.
4. Revert the shim.

### Option B: offline conversion

Bun + jsdom + our full extension set to convert markdown → JSON without a browser. Higher code surface, small risk of divergence from browser behaviour. Not yet implemented — add only if Option A is blocked.

Then:

```bash
bun --env-file=.env.tiptap-convert script/tiptap-convert/export.ts \
  --input script/tiptap-convert/phase2-real.json \
  --output script/tiptap-convert/.output/phase2-real.pdf
```

Open side-by-side with the editor and produce a per-feature diff report.

## Troubleshooting

- **401 Unauthorized** — JWT is expired or wrong app-id. Re-mint and re-try.
- **403 `CUSTOM_FONTS_NOT_AVAILABLE`** — custom fonts require Enterprise. Remove `customFonts` from request (we don't send it by default).
- **422 validation errors** — likely malformed `headers`/`footers` slot (not used by default) or schema issue. The response body includes a ZodError.
- **`expected application/pdf, got application/json`** — the API errored without a proper status code. Read the dumped body.
- **Unknown node type silently dropped** — this is the single most important failure mode to detect. If Phase 1 exits 200 but a callout is missing from the PDF, that's a **no-go** for Tiptap Convert regardless of other successes.

## Not covered by this harness

- Cloud cost / rate limit modeling.
- Headers/footers (only tested if Phase 1 passes and we opt into page-level chrome).
- Custom font provisioning (Enterprise-only).
- Automated visual regression — comparison is manual-eyeball for now.

## Cleanup after validation

Once a direction is chosen:

- Regardless of outcome: keep `phase1-stress.json` + `export.ts` in-tree as a living smoke test. Cheap, useful for future regressions.
- If Tiptap Convert is rejected: leave the harness; it serves as documentation of the decision.
- If Tiptap Convert is accepted: revisit the harness as the basis for an integration test.
