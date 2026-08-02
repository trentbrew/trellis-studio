# Studio UI primitives ontology

Agent-facing vocabulary for **`@opencode-ai/ui`** (`packages/ui/`). Tier-3 **primitives** only — index table, not a full inventory.

Canonical elevation + shell regions: [ui-elevation-ontology.md](../../specs/ui-elevation-ontology.md). App composites: [packages/app/ONTOLOGY.md](../app/ONTOLOGY.md).

## ID format

| Class | Prefix | Example | DOM attribute |
| ----- | ------ | ------- | ------------- |
| Primitive | `ui.` | `ui.button`, `ui.dialog` | `data-ui-component="ui.button"` (target) |
| Legacy alias | — | `data-component="button"` | Keep during migration |

Prefer **`ui.*`** in issues, specs, and agent speech. Link Storybook paths when debugging visuals.

## Elevation tokens (structural)

Monotonic ladder — use for **depth**, not semantic state:

| Token | Tailwind | Role |
| ----- | -------- | ---- |
| `--bg-canvas` | `bg-canvas` | App root |
| `--bg-chrome` | `bg-chrome` | Activity rail, titlebar |
| `--bg-sidebar` | `bg-sidebar` | Secondary nav |
| `--bg-panel` | `bg-panel` | Panel frame |
| `--bg-well` | `bg-well` | Editor / table body |
| `--bg-subtle` | `bg-subtle` | Cards, zebra, inset groups |
| `--bg-elevated` | `bg-elevated` | Sticky headers, selected row |
| `--bg-overlay` | `bg-overlay` | Dialog, drawer, command palette |
| `--bg-scrim` | `bg-scrim` | Modal backdrop |

Legacy aliases (`--background-base` → `--bg-canvas`, etc.) remain one release — prefer `--bg-*` in new code.

**Semantic surfaces** (`--surface-success-*`, diff colors, brand) stay separate from the ladder.

## Primitive inventory (Tier 3)

Published from `src/components/`. Storybook: `bun --cwd packages/storybook storybook` → port **6006**.

Regenerate this table: `bun packages/ui/script/gen-ontology-inventory.ts`

| ID | Module | Storybook |
| -- | ------ | --------- |
| `ui.accordion` | `accordion` | `UI/Accordion` |
| `ui.app-icon` | `app-icon` | `UI/AppIcon` |
| `ui.avatar` | `avatar` | `UI/Avatar` |
| `ui.basic-tool` | `basic-tool` | `UI/Basic Tool` |
| `ui.button` | `button` | `UI/Button` |
| `ui.card` | `card` | `UI/Card` |
| `ui.checkbox` | `checkbox` | `UI/Checkbox` |
| `ui.collapsible` | `collapsible` | `UI/Collapsible` |
| `ui.context-menu` | `context-menu` | `UI/ContextMenu` |
| `ui.dialog` | `dialog` | `UI/Dialog` |
| `ui.diff-changes` | `diff-changes` | `UI/DiffChanges` |
| `ui.dock-prompt` | `dock-prompt` | `UI/DockPrompt` |
| `ui.dock-surface` | `dock-surface` | _(no story — `data-dock-surface` slots)_ |
| `ui.dropdown-menu` | `dropdown-menu` | `UI/DropdownMenu` |
| `ui.favicon` | `favicon` | `UI/Favicon` |
| `ui.file-icon` | `file-icon` | `UI/FileIcon` |
| `ui.font` | `font` | `UI/Font` |
| `ui.hover-card` | `hover-card` | `UI/HoverCard` |
| `ui.icon-button` | `icon-button` | `UI/IconButton` |
| `ui.icon` | `icon` | `UI/Icon` |
| `ui.image-preview` | `image-preview` | `UI/ImagePreview` |
| `ui.inline-input` | `inline-input` | `UI/InlineInput` |
| `ui.keybind` | `keybind` | `UI/Keybind` |
| `ui.line-comment` | `line-comment` | `UI/LineComment` |
| `ui.list` | `list` | `UI/List` |
| `ui.logo` | `logo` | `UI/Logo` |
| `ui.markdown` | `markdown` | `UI/Markdown` |
| `ui.message-nav` | `message-nav` | `UI/MessageNav` |
| `ui.message-part` | `message-part` | `UI/MessagePart` |
| `ui.popover` | `popover` | `UI/Popover` |
| `ui.progress-circle` | `progress-circle` | `UI/ProgressCircle` |
| `ui.progress` | `progress` | `UI/Progress` |
| `ui.provider-icon` | `provider-icon` | `UI/ProviderIcon` |
| `ui.radio-group` | `radio-group` | `UI/RadioGroup` |
| `ui.resize-handle` | `resize-handle` | `UI/ResizeHandle` |
| `ui.select` | `select` | `UI/Select` |
| `ui.session-review` | `session-review` | `UI/SessionReview` |
| `ui.session-turn` | `session-turn` | `UI/SessionTurn` |
| `ui.shell-submessage-motion` | `shell-submessage-motion` | `UI/Shell Submessage Motion` |
| `ui.spinner` | `spinner` | `UI/Spinner` |
| `ui.sticky-accordion-header` | `sticky-accordion-header` | `UI/StickyAccordionHeader` |
| `ui.switch` | `switch` | `UI/Switch` |
| `ui.tabs` | `tabs` | `UI/Tabs` |
| `ui.tag` | `tag` | `UI/Tag` |
| `ui.text-field` | `text-field` | `UI/TextField` |
| `ui.text-reveal` | `text-reveal` | `UI/TextReveal` |
| `ui.text-shimmer` | `text-shimmer` | `UI/TextShimmer` |
| `ui.text-strikethrough` | `text-strikethrough` | `UI/Text Strikethrough` |
| `ui.thinking-heading` | `thinking-heading` | `UI/ThinkingHeading` |
| `ui.timeline-playground` | `timeline-playground` | `UI/TimelinePlayground` |
| `ui.toast` | `toast` | `UI/Toast` |
| `ui.todo-panel-motion` | `todo-panel-motion` | `UI/Todo Panel Motion` |
| `ui.tool-count-summary` | `tool-count-summary` | `UI/AnimatedCountList` |
| `ui.tool-error-card` | `tool-error-card` | `UI/ToolErrorCard` |
| `ui.tooltip` | `tooltip` | `UI/Tooltip` |
| `ui.typewriter` | `typewriter` | `UI/Typewriter` |
| `ui.theme.elevation` | `theme/elevation` | `Theme/Elevation` |

## Layout-adjacent primitives

| ID | Module | Pattern link |
| -- | ------ | ------------ |
| `ui.dock-surface` | `dock-surface` | `layout.dock` — slots `shell`, `tray` |

## Theme & tokens

| Path | Role |
| ---- | ---- |
| `src/theme/resolve.ts` | OC-2 token resolution + `--bg-*` ladder |
| `src/styles/tailwind/colors.css` | Generated Tailwind color utilities |
| `src/design-system/token-validator.ts` | Token lint helpers |
| `src/theme/elevation.stories.tsx` | Storybook elevation matrix |

## Agent vocabulary

- **Primitive** → `ui.dialog`, not “modal component”
- **Elevation** → `bg-well`, not `background-weak`
- **Structural bg** → `--bg-*`; **state bg** → `--surface-*`

## Related

- [ui-elevation-ontology.md](../../specs/ui-elevation-ontology.md) — shell regions, layout patterns
- [packages/app/ONTOLOGY.md](../app/ONTOLOGY.md) — app composites
- [whiteboard-ontology.md](../../specs/whiteboard-ontology.md) — template for domain vocab specs
