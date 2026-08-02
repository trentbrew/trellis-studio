---
name: rich-text-editor
description: Rich text and code editing in the app. Use when user wants to edit files with syntax highlighting, markdown, or inline editing capabilities.
---

# Rich Text Editor Skill

The app provides multiple editing modes for different file types.

## Editor Types

### Code Editor (Monaco)

For source code files (.ts, .js, .tsx, .jsx, .json, etc.):

- Syntax highlighting
- IntelliSense
- Multi-cursor editing
- Find/replace

### Markdown Editor (TipTap)

For markdown files (.md, .mdx):

- WYSIWYG editing
- Frontmatter support — use typed `[[type:slug]]` values for queryable graph edges
- WikiLinks in body (`[[person:alex]]`) create mentions edges on save
- Code blocks
- Tables, lists, links

Load the **semantic-linking** skill when editing markdown that should connect to the knowledge graph.

### Inline Editor

For quick edits to values in the UI:

- Double-click to edit
- Press Enter to save
- Escape to cancel

## File Type Detection

The app auto-selects editor based on file extension:

| Extension                                 | Editor            |
| ----------------------------------------- | ----------------- |
| .ts, .js, .tsx, .jsx, .json, .yaml, .toml | Code (Monaco)     |
| .md, .mdx                                 | Markdown (TipTap) |
| .txt, .log                                | Plain text        |

## Usage

### Opening Files

Click file tabs or use file picker to open files in editor.

### Switching Editors

For files with multiple possible editors:

- Click editor dropdown in tab
- Select "Code" or "Markdown"

### Keyboard Shortcuts

- `Cmd+S` — Save file
- `Cmd+F` — Find
- `Cmd+Shift+F` — Replace
- `Cmd+P` — Quick open

## Inline Editing

The `createInlineEditorController` provides inline editing for values:

```tsx
const ctrl = createInlineEditorController()
ctrl.openEditor("workspace:my-workspace", currentValue)
// ... edit ...
ctrl.saveEditor((next) => {
  // Handle saved value
})
ctrl.closeEditor()
```

## Frontmatter

Markdown files support YAML frontmatter:

```yaml
---
title: My Document
author: John
date: 2026-04-04
---
```

The frontmatter editor provides:

- Field key editing
- Value editing
- Add/remove fields
