# Visual Authoring Roadmap

## North Star

TurtleCode should support an agent-native visual authoring workflow where TrellisDB/CMS provides structured data, the Design surface provides project meaning, the Browser/Preview surface provides selection and context, and the agent handles code-aware changes.

This is not intended to become a full Webflow or Framer clone. The target is a visual, CMS-aware, asset-aware, design-system-aware editing layer that makes user intent precise and enables safe direct edits only when the target has a structured persistence model.

## Product Surfaces

### CMS / TrellisDB

The CMS is the structured data layer for entries, collections, schemas, media fields, formula fields, drafts, publishing, and SDK-facing TrellisDB APIs.

### Design

The Design rail surface groups the visual knowledge of the project:

- Components
- Patterns
- Tokens
- CMS Bindings
- Assets

Assets should initially live under Design. They should only become a separate rail destination if asset management becomes a primary high-volume workflow.

### Browser / Preview

The Browser/Preview surface should become selectable and inspectable:

- Hover outlines
- Click selection
- Layer tree
- Selected element metadata
- Safe inline controls when a structured binding exists

### Agent

The agent remains the primary surface for ambiguous, structural, or code-backed changes. Visual selection, CMS bindings, asset metadata, and design registry data should become precise context for agent actions.

**Ambient focus:** Every surface (not only preview) should publish what the user is looking at to the prompt panel and context window — see [agent-focus-context.md](./agent-focus-context.md). TRL-46/48 selection payloads plug into the same `FocusContext` contract.

## Core Product Decisions

### Inline Editing

Direct inline editing should be limited to safe structured targets:

- CMS fields
- Asset/media references
- Known component props
- Known design tokens

Unknown source-backed or structural edits should be agent-mediated.

### Assets

Assets are worth modeling as first-class project knowledge. Binary data should live in local project files, object storage, or providers like Mux. Trellis should store metadata, semantic meaning, and relationships.

### AI Metadata

AI-generated metadata should be optional, provider-pluggable, and clearly separated from human-authored canonical metadata. Gemini is the preferred first provider; local models can be added later.

### Video

Mux is a good fit for video hosting, transcoding, thumbnails, streaming playback, and lifecycle events. Trellis should store Mux IDs, playback metadata, semantic metadata, and usage relationships.

## Milestone Issues

### TRL-138: Design Brand Kit & project design system

See [design-brand-kit.md](./design-brand-kit.md) for the full scope: Brand as a composition entity (references palettes, fonts, icons, tokens — does not duplicate them), catalog vs Trellis entity split, sidebar IA (Brand Kit vs Assets), cloud templates vs project overrides vs sandbox federation cache, and phased delivery starting with Lucide-first icon catalog/picker.

### TRL-41: TrellisDB CMS foundations for formulas, schemas, and media

Establish the schema-aware CMS/TrellisDB foundation needed for design, assets, inline editing, and SDK consumers.

Acceptance criteria:

- `trellis/cms` SDK evaluates formula fields consistently for list, get, and subscriptions.
- SDK exposes collection schema metadata including required/default/options/reference/formula/media fields.
- Media field conventions for image, video, audio, and file are documented and reflected in IDE/tool guidance.
- Validation covers SDK tests plus app/opencode typechecks where touched.

### TRL-42: Design rail MVP with components, tokens, patterns, bindings, and assets

Add one first-class Design rail surface that houses components, tokens, patterns, CMS bindings, and assets without creating separate rail clutter.

Acceptance criteria:

- Design rail item is available as a session view and preserves existing rail order behavior.
- Design panel has navigable sections for Components, Tokens, Patterns, CMS Bindings, and Assets.
- Empty states explain the purpose of each section and guide agent/user workflows.
- Browser smoke verifies navigation into and out of Design.

### TRL-43: Asset library MVP under Design

Introduce Assets as Trellis-managed metadata entities with binaries stored externally or in project files.

Acceptance criteria:

- Asset entity convention supports name, slug, kind, url/path, mime, dimensions/duration, alt, caption, tags, source, and provider metadata.
- Design > Assets lists, filters, previews, and opens asset detail.
- Users can create assets from URL/path and edit canonical metadata.
- CMS media fields can select or reference assets without requiring binary storage changes.

### TRL-44: AI-generated semantic metadata for assets

Add optional AI enrichment for assets so users and agents can search by meaning, generate alt text, and understand media content.

Acceptance criteria:

- AI metadata is stored separately from canonical human-authored metadata.
- Pluggable `AssetEnricher` interface supports noop and Gemini image analysis providers.
- UI marks generated descriptions, tags, OCR, and alt text as suggestions with accept/regenerate/dismiss flows.
- Asset search includes generated descriptions/tags/OCR text and handles disabled AI gracefully.

### TRL-45: Mux-backed video asset support

Use Mux for video binary hosting, transcoding, playback IDs, thumbnails, and lifecycle status while Trellis stores asset metadata, relationships, and semantic enrichment.

Acceptance criteria:

- Server-side Mux configuration keeps credentials out of frontend code.
- Direct upload flow creates/updates Asset entities with uploading/processing/ready/failed status.
- Mux webhook handling syncs playback ID, provider asset ID, duration/aspect, thumbnails, and failures.
- Video assets can be previewed and prepared for transcript/summary/chapter enrichment.

### TRL-46: Preview inspector, visual selection, and layer tree

Make the preview/browser selectable and inspectable so users can point at elements, see layers/markup, and pass precise selected-element context to the agent.

Acceptance criteria:

- Inspect mode outlines hovered elements and supports click selection without interfering when disabled.
- Selected element metadata includes tag, text, attrs, classes, bounds, selector/path, computed styles, and nearby text.
- Layer tree syncs with the selected node and hides obvious noise where practical.
- Selection context is available to the agent in a concise form.

### TRL-47: Inline editing MVP for CMS text and media

Enable direct inline edits only for safe structured targets such as CMS fields and known asset/media bindings; route ambiguous structural edits through the agent.

Acceptance criteria:

- `VisualSelection` binding model represents DOM, CMS, component, token, source, and asset bindings.
- Known CMS text selections can be edited directly and persisted as CMS facts.
- Known media selections can be replaced from the asset library or media picker.
- Unknown/source-backed selections offer agent-mediated actions instead of unsafe direct mutation.

### TRL-48: Agent tooling for design, assets, and selected visual context

Teach the agent/tooling how to reason about CMS schemas, media fields, asset search, design registry conventions, and selected preview elements.

Acceptance criteria:

- CMS tool guidance covers media, assets, formulas, and schema design heuristics.
- Agent can search/list candidate assets using canonical and AI-generated metadata.
- Selected visual context is included in prompts/actions so users can say “this”.
- Agent distinguishes direct structured edits from code/structural edits that require patches.

### TRL-49: Governance, privacy, and validation for visual authoring

Add guardrails for AI analysis, provider disclosure, metadata review, usage tracking, and cross-surface validation for the visual authoring roadmap.

Acceptance criteria:

- AI analysis settings support off/ask/automatic and identify external providers.
- Generated metadata review flow keeps human-authored fields canonical.
- Asset usage tracking can show CMS references and known design/component usage.
- Tests/smokes cover SDK formulas/schema/media, Design rail, asset picker, preview selection, and inline edits with external providers mocked.

## Suggested Execution Order

1. Finish TrellisDB/CMS foundations.
2. Add the Design rail shell.
3. Add Asset library MVP without AI.
4. Add AI image enrichment and metadata search.
5. Add preview selection and layer tree.
6. Add inline CMS/media editing.
7. Add Mux video support.
8. Expand agent tooling and governance.

## Validation Strategy

Each implementation slice should include:

- Package-level `bun typecheck` from touched package directories.
- Focused tests for SDK/data-model behavior.
- Browser smoke for IDE-facing routes and interactions.
- Mocked provider tests for Gemini/Mux integrations.
- Manual verification that direct edits only appear for structured safe bindings.
