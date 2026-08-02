import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { useTheme } from "@opencode-ai/ui/theme/context"
import type { FileState } from "@/context/file"
import { useGlobalSDK } from "@/context/global-sdk"
import { useSDK } from "@/context/sdk"
import { useLocal } from "@/context/local"
import { useData } from "@opencode-ai/ui/context/data"
import { useMarked } from "@opencode-ai/ui/context/marked"
import { useModels } from "@/context/models"
import { usePreview } from "@/context/preview"
import { resolveThemeVariant } from "@opencode-ai/ui/theme/resolve"
import type { DesktopTheme, ResolvedTheme } from "@opencode-ai/ui/theme/types"
import { createEffect, createMemo, createSignal, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { onTtsState, playTts, stopTts, ttsState, type TtsState } from "@opencode-ai/ui/tts"
import { useLanguage } from "@/context/language"
import { Editor as Rich } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import { Markdown as MarkdownExt } from "@tiptap/markdown"
import { ImageBlock } from "@/lib/tiptap/image-block"
import { createWhiteboardEmbedMount } from "@/lib/whiteboard/markdown-embed-mount"
import { dispatchProjectionFocus } from "@/lib/projection-focus"
import { TableKit } from "@tiptap/extension-table/kit"
import { Callout } from "@/lib/tiptap/callout"
import { CodeBlockHighlight } from "@/lib/tiptap/code-block"
import { ImagePaste } from "@/lib/tiptap/image-paste"
import { MarkdownPaste } from "@/lib/tiptap/markdown-paste"
import { SlashCommand } from "@/lib/tiptap/slash-command"
import { Frontmatter } from "@/lib/tiptap/frontmatter"
import { Mention } from "@/lib/tiptap/mention"
import { MentionSuggestion } from "@/lib/tiptap/mention-suggestion"
import { MentionPreview } from "@/lib/tiptap/mention-preview"
import { FileLink } from "@/lib/tiptap/file-link"
import { LinkShortcut } from "@/lib/tiptap/link-shortcut"
import { MakeEntity } from "@/lib/tiptap/make-entity"
import { Embed } from "@/lib/tiptap/embed"
import { DragHandle } from "@/lib/tiptap/drag-handle"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import type { MentionItem } from "@/lib/tiptap/mention-suggestion"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import "monaco-editor/esm/vs/basic-languages/monaco.contribution"
import "monaco-editor/esm/vs/language/css/monaco.contribution"
import "monaco-editor/esm/vs/language/html/monaco.contribution"
import "monaco-editor/esm/vs/language/json/monaco.contribution"
import "monaco-editor/esm/vs/language/typescript/monaco.contribution"
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import "monaco-editor/min/vs/editor/editor.main.css"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { CsvViewer } from "./csv-editor"
import { BaseEditor } from "./base-editor"
import { FrontmatterPanel } from "./frontmatter-panel"
import { parse as parseFrontmatter } from "@opencode-ai/ui/frontmatter"
import { serializeFrontmatter } from "@/lib/tiptap/frontmatter-editor"
import { media } from "./media"
import { browse } from "@/lib/preview-url"

const decodeEntities = (html: string) => {
  if (typeof document === "undefined") return html
  const txt = document.createElement("textarea")
  txt.innerHTML = html
  return txt.value
}

const markdownMode = (file: string) => /\.(md|markdown|mdx|note)$/i.test(file)
const csvMode = (file: string) => /\.csv$/i.test(file)
const webMode = (file: string) => /\.web$/i.test(file)
const htmlMode = (file: string) => /\.html?$/i.test(file)
const baseMode = (file: string) => /\.base$/i.test(file)
const videoMode = (file: string) => /\.(mp4|webm|ogv|mov|mkv|avi)$/i.test(file)
const imageMode = (file: string) => /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|apng|jxl)$/i.test(file)

const ext = (file: string) => {
  const idx = file.lastIndexOf(".")
  return idx === -1 ? "" : file.slice(idx + 1).toLowerCase()
}

const monacoLanguage = (file: string) => {
  const value = ext(file)
  if (["ts", "tsx", "mts", "cts"].includes(value)) return "typescript"
  if (["js", "jsx", "mjs", "cjs"].includes(value)) return "javascript"
  if (["json", "jsonc", "json5"].includes(value)) return "json"
  if (["css", "scss", "sass", "less"].includes(value)) return "css"
  if (["html", "htm"].includes(value)) return "html"
  if (value === "vue") return "html"
  if (value === "svelte") return "html"
  if (["md", "markdown", "mdx", "note"].includes(value)) return "markdown"
  if (["yml", "yaml", "base"].includes(value)) return "yaml"
  if (["sh", "bash", "zsh", "fish"].includes(value)) return "shell"
  if (value === "sql") return "sql"
  if (value === "xml") return "xml"
  const base = file.split("/").pop()?.toLowerCase() ?? ""
  if (base === "justfile") return "shell"
  return "plaintext"
}

let setup = false

const resolveHex = (tokens: ResolvedTheme, token: string): string => {
  const value = tokens[token]
  if (!value) return "#000000"
  if (value.startsWith("var(--")) {
    return resolveHex(tokens, value.slice(6, -1))
  }
  return value
}

function updateMonacoTheme(theme: DesktopTheme, mode: "light" | "dark") {
  if (typeof window === "undefined") return
  const variant = mode === "dark" ? theme.dark : theme.light
  const tokens = resolveThemeVariant(variant, mode === "dark")

  const bg = resolveHex(tokens, "background-base")
  const fg = resolveHex(tokens, "text-base")
  const lineHighlight = resolveHex(tokens, "surface-base-hover")
  const selection = mode === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"

  monaco.editor.defineTheme("oc-current", {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: resolveHex(tokens, "syntax-comment").slice(1) },
      { token: "keyword", foreground: resolveHex(tokens, "syntax-keyword").slice(1) },
      { token: "string", foreground: resolveHex(tokens, "syntax-string").slice(1) },
      { token: "number", foreground: resolveHex(tokens, "syntax-primitive").slice(1) },
      { token: "type", foreground: resolveHex(tokens, "syntax-type").slice(1) },
      { token: "operator", foreground: resolveHex(tokens, "syntax-operator").slice(1) },
      { token: "delimiter", foreground: resolveHex(tokens, "syntax-punctuation").slice(1) },
    ],
    colors: {
      "editor.background": bg,
      "editor.foreground": fg,
      "editor.lineHighlightBackground": lineHighlight,
      "editor.selectionBackground": selection,
      "editor.inactiveSelectionBackground": selection,
      "editor.selectionHighlightBackground": selection,
      "editor.findMatchBackground": selection,
      "editor.findMatchHighlightBackground": selection,
      "editor.rangeHighlightBackground": lineHighlight,
      "editor.wordHighlightBackground": lineHighlight,
      "editor.wordHighlightStrongBackground": lineHighlight,
      "editorLineNumber.foreground": resolveHex(tokens, "text-weaker"),
      "editorLineNumber.activeForeground": resolveHex(tokens, "text-weak"),
      "editorIndentGuide.background": resolveHex(tokens, "border-weaker-base"),
      "editorIndentGuide.activeBackground": resolveHex(tokens, "border-weak-base"),
    },
  })
  monaco.editor.setTheme("oc-current")
}

function monacoSetup() {
  if (setup || typeof window === "undefined") return
  const root = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_: string, label: string) => Worker
    }
  }
  root.MonacoEnvironment = {
    getWorker: (_, label) => {
      if (label === "json") return new jsonWorker()
      if (["css", "scss", "less"].includes(label)) return new cssWorker()
      if (["html", "handlebars", "razor"].includes(label)) return new htmlWorker()
      if (["typescript", "javascript"].includes(label)) return new tsWorker()
      return new editorWorker()
    },
  }

  const tsOpts: monaco.languages.typescript.CompilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    jsxImportSource: "solid-js",
    allowJs: true,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: false,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    resolveJsonModule: true,
    baseUrl: ".",
    paths: { "@/*": ["src/*"] },
  }

  const tsDiag: monaco.languages.typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    diagnosticCodesToIgnore: [
      2307, // Cannot find module (unresolved imports — expected without full node_modules)
      2304, // Cannot find name (ambient types not loaded)
      2552, // Cannot find name, did you mean...
      2503, // Cannot find namespace
      7016, // Could not find declaration file
      7006, // Parameter implicitly has 'any' type
      2686, // UMD global reference
      1259, // Module can only be default-imported
      1192, // Module has no default export
      2792, // Cannot find module (import type)
      6133, // Declared but never read
      6196, // Declared but never used
    ],
  }

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(tsOpts)
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(tsDiag)
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    ...tsOpts,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    checkJs: false,
  })
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(tsDiag)
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)

  setup = true
}

export function CodeEditor(props: { path: string; value: string; active: boolean; onChange: (value: string) => void }) {
  const theme = useTheme()
  const sdk = useSDK()
  const local = useLocal()
  let root: HTMLDivElement | undefined
  let editor: monaco.editor.IStandaloneCodeEditor | undefined
  let change: monaco.IDisposable | undefined
  let widget: InlineEditWidget | undefined

  onMount(() => {
    if (!root) return
    monacoSetup()
    const current = theme.themes()[theme.themeId()]
    if (current) updateMonacoTheme(current, theme.mode())
    editor = monaco.editor.create(root, {
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      folding: true,
      foldingStrategy: "auto",
      foldingHighlight: true,
      showFoldingControls: "mouseover",
      unfoldOnClickAfterEndOfLine: true,
      fontFamily: "Berkley Mono",
      fontLigatures: true,
      language: monacoLanguage(props.path),
      guides: { bracketPairs: true, indentation: true },
      lineNumbersMinChars: 3,
      minimap: { enabled: true, side: "right", size: "proportional", showSlider: "mouseover" },
      padding: { top: 12, bottom: 24 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      theme: "oc-current",
      value: props.value,
      wordWrap: markdownMode(props.path) ? "on" : "off",
      hover: { enabled: true, delay: 300 },
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showFunctions: true,
        showVariables: true,
        showClasses: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showConstants: true,
        showFields: true,
        showMethods: true,
        preview: true,
        insertMode: "replace",
      },
      quickSuggestions: { other: true, strings: false, comments: false },
      parameterHints: { enabled: true, cycle: true },
      formatOnPaste: true,
      inlineSuggest: { enabled: true },
    })
    change = editor.onDidChangeModelContent(() => props.onChange(editor?.getValue() ?? ""))

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      if (!editor) return
      widget?.dispose()
      widget = new InlineEditWidget({
        editor,
        path: props.path,
        language: monacoLanguage(props.path),
        sdk,
        model: () => local.model.current(),
      })
      widget.open()
    })
  })

  createEffect(() => {
    const value = props.value
    if (!editor) return
    if (value === editor.getValue()) return
    const pos = editor.getPosition()
    editor.setValue(value)
    if (pos) editor.setPosition(pos)
  })

  createEffect(() => {
    const value = props.path
    const model = editor?.getModel()
    if (!model) return
    monaco.editor.setModelLanguage(model, monacoLanguage(value))
    editor?.updateOptions({
      minimap: markdownMode(value)
        ? { enabled: false }
        : { enabled: true, side: "right", size: "proportional", showSlider: "mouseover" },
      wordWrap: markdownMode(value) ? "on" : "off",
    })
  })

  createEffect(() => {
    const current = theme.themes()[theme.themeId()]
    if (!current) return
    updateMonacoTheme(current, theme.mode())
  })

  createEffect(
    on(
      () => props.active,
      (active, prev) => {
        if (!active || prev) return
        queueMicrotask(() => editor?.focus())
      },
    ),
  )

  onCleanup(() => {
    widget?.dispose()
    change?.dispose()
    editor?.dispose()
  })

  return <div ref={root} class="h-full min-h-0" />
}

type SDKLike = ReturnType<typeof useSDK>
type ModelAccessor = () => { id: string; provider: { id: string } } | undefined

interface RewriteRequest {
  sdk: SDKLike
  path: string
  language?: string
  before: string
  selection: string
  after: string
  instruction: string
  model: ReturnType<ModelAccessor>
  signal: AbortSignal
  onChunk?: (chunk: string) => void
}

async function rewriteRequest(req: RewriteRequest): Promise<string> {
  const params = new URLSearchParams({ directory: req.sdk.directory })
  const res = await req.sdk.fetch(`${req.sdk.url}/file/rewrite?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain" },
    body: JSON.stringify({
      path: req.path,
      language: req.language,
      before: req.before,
      selection: req.selection,
      after: req.after,
      instruction: req.instruction,
      providerID: req.model?.provider.id,
      modelID: req.model?.id,
    }),
    signal: req.signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`rewrite failed (${res.status}) ${text.slice(0, 200)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) {
    // No stream — fall back to full text response
    const text = await res.text()
    if (text) req.onChunk?.(text)
    return text
  }
  const decoder = new TextDecoder()
  let total = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (!chunk) continue
      total += chunk
      req.onChunk?.(chunk)
    }
    const tail = decoder.decode()
    if (tail) {
      total += tail
      req.onChunk?.(tail)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }
  return total
}

interface InlineEditOpts {
  editor: monaco.editor.IStandaloneCodeEditor
  path: string
  language: string
  sdk: SDKLike
  model: ModelAccessor
}

const CONTEXT_LINES = 120

type InlineEditState = "idle" | "streaming" | "awaiting" | "error"

class InlineEditWidget {
  private readonly root: HTMLDivElement
  private readonly input: HTMLTextAreaElement
  private readonly status: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly preview: HTMLPreElement
  private readonly previewWrap: HTMLDivElement
  private selection: monaco.Range | undefined
  private abort: AbortController | undefined
  private zoneId: string | undefined
  private redDeco: monaco.editor.IEditorDecorationsCollection | undefined
  private disposed = false
  private state: InlineEditState = "idle"
  private replacement = ""
  private readonly lineHeight: number

  constructor(private readonly opts: InlineEditOpts) {
    this.lineHeight = opts.editor.getOption(monaco.editor.EditorOption.lineHeight) || 18

    this.root = document.createElement("div")
    this.root.className = "inline-edit-zone"
    this.root.setAttribute("data-component", "inline-edit")
    this.root.tabIndex = -1

    const inputRow = document.createElement("div")
    inputRow.className = "inline-edit-input-row"

    const prefix = document.createElement("div")
    prefix.className = "inline-edit-prefix"
    prefix.textContent = "✱"

    this.input = document.createElement("textarea")
    this.input.rows = 1
    this.input.placeholder = "Edit selection with AI… (Enter to submit, Esc to cancel)"
    this.input.spellcheck = false
    this.input.className = "inline-edit-input"

    inputRow.appendChild(prefix)
    inputRow.appendChild(this.input)

    this.status = document.createElement("div")
    this.status.className = "inline-edit-status"
    this.status.style.display = "none"

    this.previewWrap = document.createElement("div")
    this.previewWrap.className = "inline-edit-preview-wrap"
    this.previewWrap.style.display = "none"

    this.preview = document.createElement("pre")
    this.preview.className = "inline-edit-preview"
    this.previewWrap.appendChild(this.preview)

    this.hint = document.createElement("div")
    this.hint.className = "inline-edit-hint"
    this.hint.textContent = "Enter submit · Esc cancel"

    this.root.appendChild(inputRow)
    this.root.appendChild(this.previewWrap)
    this.root.appendChild(this.status)
    this.root.appendChild(this.hint)

    this.root.addEventListener("keydown", this.onKey, true)
    this.root.addEventListener("mousedown", (e) => e.stopPropagation())
    this.root.addEventListener("wheel", (e) => e.stopPropagation())
    this.input.addEventListener("input", this.onInputResize)
  }

  open() {
    const editor = this.opts.editor
    const sel = editor.getSelection()
    if (!sel) return
    this.selection = sel.isEmpty()
      ? new monaco.Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber, sel.startColumn)
      : new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)

    editor.changeViewZones((accessor) => {
      this.zoneId = accessor.addZone({
        afterLineNumber: this.selection!.endLineNumber,
        domNode: this.root,
        suppressMouseDown: false,
        heightInPx: this.measureRootHeight(80),
      })
    })

    queueMicrotask(() => this.input.focus())
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.abort?.abort()
    this.redDeco?.clear()
    this.redDeco = undefined
    if (this.zoneId !== undefined) {
      const id = this.zoneId
      this.zoneId = undefined
      try {
        this.opts.editor.changeViewZones((accessor) => accessor.removeZone(id))
      } catch {
        // zone may already be gone
      }
    }
    this.root.removeEventListener("keydown", this.onKey, true)
    this.input.removeEventListener("input", this.onInputResize)
  }

  private measureRootHeight(min: number): number {
    // Use current scrollHeight when attached, else fallback to minimum.
    const h = this.root.isConnected ? this.root.scrollHeight : 0
    return Math.max(min, h + 4)
  }

  private relayout() {
    if (this.zoneId === undefined) return
    const id = this.zoneId
    const h = this.measureRootHeight(80)
    try {
      this.opts.editor.changeViewZones((accessor) => {
        accessor.layoutZone(id)
      })
      // Monaco doesn't update zone height from a layoutZone call alone; we remove+re-add
      // the zone when height must change significantly.
      const zone = this.root.getBoundingClientRect().height
      if (Math.abs(zone - h) > this.lineHeight) {
        this.opts.editor.changeViewZones((accessor) => {
          accessor.removeZone(id)
          this.zoneId = accessor.addZone({
            afterLineNumber: this.selection!.endLineNumber,
            domNode: this.root,
            heightInPx: h,
          })
        })
      }
    } catch {
      // ignore during teardown
    }
  }

  private onInputResize = () => {
    this.input.style.height = "auto"
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`
    this.relayout()
  }

  private onKey = (event: KeyboardEvent) => {
    // Monaco observes keydowns on the editor DOM; stop bubbling so it doesn't act on them.
    if (this.state === "awaiting") {
      if (event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()
        this.accept()
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        this.reject()
        return
      }
      // Swallow other keys in awaiting so we don't accidentally edit the buffer.
      event.stopPropagation()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (this.state === "streaming") this.abort?.abort()
      this.dispose()
      queueMicrotask(() => this.opts.editor.focus())
      return
    }
    if (event.key === "Enter" && !event.shiftKey && this.state === "idle") {
      event.preventDefault()
      event.stopPropagation()
      void this.submit()
      return
    }
  }

  private setStatus(message: string | undefined) {
    if (message) {
      this.status.textContent = message
      this.status.style.display = "block"
    } else {
      this.status.style.display = "none"
    }
    this.relayout()
  }

  private setHint(text: string) {
    this.hint.textContent = text
  }

  private showPreview() {
    this.previewWrap.style.display = "block"
    this.relayout()
  }

  private markOriginal() {
    if (!this.selection) return
    if (this.selection.isEmpty()) return
    this.redDeco?.clear()
    this.redDeco = this.opts.editor.createDecorationsCollection([
      {
        range: this.selection,
        options: {
          className: "inline-edit-original",
          inlineClassName: "inline-edit-original-inline",
        },
      },
    ])
  }

  private async submit() {
    const editor = this.opts.editor
    const model = editor.getModel()
    if (!editor || !model || !this.selection) return
    const instruction = this.input.value.trim()
    if (!instruction) return

    const selRange = this.selection
    const selText = model.getValueInRange(selRange)

    const totalLines = model.getLineCount()
    const beforeStart = Math.max(1, selRange.startLineNumber - CONTEXT_LINES)
    const afterEnd = Math.min(totalLines, selRange.endLineNumber + CONTEXT_LINES)
    const before = model.getValueInRange(
      new monaco.Range(beforeStart, 1, selRange.startLineNumber, selRange.startColumn),
    )
    const after = model.getValueInRange(
      new monaco.Range(selRange.endLineNumber, selRange.endColumn, afterEnd, model.getLineMaxColumn(afterEnd)),
    )

    const current = this.opts.model()
    const abort = new AbortController()
    this.abort = abort
    this.state = "streaming"
    this.replacement = ""
    this.preview.textContent = ""
    this.markOriginal()
    this.showPreview()
    this.setStatus("Generating…")
    this.setHint("Esc cancel")
    this.input.disabled = true

    try {
      await rewriteRequest({
        sdk: this.opts.sdk,
        path: this.opts.path,
        language: this.opts.language,
        before,
        selection: selText,
        after,
        instruction,
        model: current,
        signal: abort.signal,
        onChunk: (chunk) => {
          if (this.disposed || abort.signal.aborted) return
          this.replacement += chunk
          this.preview.textContent = this.replacement
          this.relayout()
        },
      })
      if (this.disposed) return
      this.state = "awaiting"
      this.setStatus(undefined)
      this.setHint("Tab accept · Esc reject")
      this.input.disabled = true
      queueMicrotask(() => this.root.focus())
    } catch (err) {
      if (this.disposed) return
      if ((err as Error).name === "AbortError") {
        this.dispose()
        return
      }
      this.state = "error"
      this.setStatus((err as Error).message || "Request failed")
      this.setHint("Esc close")
      this.input.disabled = false
    }
  }

  private accept() {
    const editor = this.opts.editor
    const model = editor.getModel()
    if (!model || !this.selection) return
    model.pushStackElement()
    model.applyEdits([{ range: this.selection, text: this.replacement }])
    model.pushStackElement()
    const startLine = this.selection.startLineNumber
    const startCol = this.selection.startColumn
    const endOffset = model.getOffsetAt({ lineNumber: startLine, column: startCol }) + this.replacement.length
    const endPos = model.getPositionAt(endOffset)
    const acceptedRange = new monaco.Range(startLine, startCol, endPos.lineNumber, endPos.column)
    this.dispose()
    editor.setSelection(acceptedRange)
    queueMicrotask(() => editor.focus())
  }

  private reject() {
    this.dispose()
    queueMicrotask(() => this.opts.editor.focus())
  }
}

interface MarkdownInlineEditOpts {
  editor: Rich
  path: string
  sdk: SDKLike
  model: ModelAccessor
}

const MARKDOWN_CONTEXT_CHARS = 4000
let markdownWidgetCounter = 0

class MarkdownInlineEdit {
  private readonly pluginKey: PluginKey
  private readonly container: HTMLDivElement
  private readonly input: HTMLTextAreaElement
  private readonly status: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly preview: HTMLPreElement
  private readonly previewWrap: HTMLDivElement
  private abort: AbortController | undefined
  private from = 0
  private to = 0
  private scrollHandler?: () => void
  private resizeHandler?: () => void
  private disposed = false
  private state: InlineEditState = "idle"
  private replacement = ""
  private strikeActive = false

  constructor(private readonly opts: MarkdownInlineEditOpts) {
    this.pluginKey = new PluginKey(`inline-edit-${++markdownWidgetCounter}`)

    this.container = document.createElement("div")
    this.container.className = "inline-edit-floating"
    this.container.setAttribute("data-component", "inline-edit")
    this.container.tabIndex = -1

    const row = document.createElement("div")
    row.className = "inline-edit-input-row"

    const prefix = document.createElement("div")
    prefix.className = "inline-edit-prefix"
    prefix.textContent = "✱"

    this.input = document.createElement("textarea")
    this.input.rows = 1
    this.input.placeholder = "Edit selection with AI… (Enter to submit, Esc to cancel)"
    this.input.spellcheck = false
    this.input.className = "inline-edit-input"

    row.appendChild(prefix)
    row.appendChild(this.input)

    this.previewWrap = document.createElement("div")
    this.previewWrap.className = "inline-edit-preview-wrap"
    this.previewWrap.style.display = "none"

    this.preview = document.createElement("pre")
    this.preview.className = "inline-edit-preview"
    this.previewWrap.appendChild(this.preview)

    this.status = document.createElement("div")
    this.status.className = "inline-edit-status"
    this.status.style.display = "none"

    this.hint = document.createElement("div")
    this.hint.className = "inline-edit-hint"
    this.hint.textContent = "Enter submit · Esc cancel"

    this.container.appendChild(row)
    this.container.appendChild(this.previewWrap)
    this.container.appendChild(this.status)
    this.container.appendChild(this.hint)

    this.container.addEventListener("keydown", this.onKey, true)
    this.input.addEventListener("input", this.autosize)
  }

  open() {
    const editor = this.opts.editor
    const sel = editor.state.selection
    this.from = sel.from
    this.to = sel.to
    document.body.appendChild(this.container)
    this.position()
    this.scrollHandler = () => this.position()
    this.resizeHandler = () => this.position()
    window.addEventListener("scroll", this.scrollHandler, true)
    window.addEventListener("resize", this.resizeHandler)
    queueMicrotask(() => this.input.focus())
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.abort?.abort()
    this.removeStrike()
    this.container.removeEventListener("keydown", this.onKey, true)
    this.input.removeEventListener("input", this.autosize)
    if (this.scrollHandler) window.removeEventListener("scroll", this.scrollHandler, true)
    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler)
    if (this.container.parentElement) this.container.parentElement.removeChild(this.container)
  }

  private applyStrike() {
    if (this.strikeActive) return
    if (this.from >= this.to) return
    const editor = this.opts.editor
    const key = this.pluginKey
    const fromPos = this.from
    const toPos = this.to
    const plugin = new Plugin({
      key,
      state: {
        init: (_cfg, state) =>
          DecorationSet.create(state.doc, [
            Decoration.inline(fromPos, toPos, { class: "inline-edit-original-inline" }),
          ]),
        apply: (tr, value) => value.map(tr.mapping, tr.doc),
      },
      props: {
        decorations(state) {
          return key.getState(state)
        },
      },
    })
    try {
      editor.registerPlugin(plugin)
      this.strikeActive = true
    } catch {
      // registration may fail during teardown
    }
  }

  private removeStrike() {
    if (!this.strikeActive) return
    try {
      this.opts.editor.unregisterPlugin(this.pluginKey)
    } catch {
      // plugin may already be gone
    }
    this.strikeActive = false
  }

  private position() {
    const view = this.opts.editor.view
    if (!view) return
    try {
      const coords = view.coordsAtPos(this.to)
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = this.container.offsetWidth || 520
      const height = this.container.offsetHeight || 100
      const left = Math.max(8, Math.min(coords.left, vw - width - 8))
      let top = coords.bottom + 6
      if (top + height > vh - 8) top = Math.max(8, coords.top - height - 6)
      this.container.style.left = `${left}px`
      this.container.style.top = `${top}px`
    } catch {
      // position out of doc; ignore
    }
  }

  private autosize = () => {
    this.input.style.height = "auto"
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`
    this.position()
  }

  private onKey = (event: KeyboardEvent) => {
    if (this.state === "awaiting") {
      if (event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()
        this.accept()
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        this.reject()
        return
      }
      event.stopPropagation()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (this.state === "streaming") this.abort?.abort()
      this.dispose()
      queueMicrotask(() => this.opts.editor.commands.focus())
      return
    }
    if (event.key === "Enter" && !event.shiftKey && this.state === "idle") {
      event.preventDefault()
      event.stopPropagation()
      void this.submit()
    }
  }

  private setStatus(message: string | undefined) {
    if (message) {
      this.status.textContent = message
      this.status.style.display = "block"
    } else {
      this.status.style.display = "none"
    }
    this.position()
  }

  private setHint(text: string) {
    this.hint.textContent = text
  }

  private showPreview() {
    this.previewWrap.style.display = "block"
    this.position()
  }

  private serializeRange(from: number, to: number): string {
    const editor = this.opts.editor
    if (from >= to) return ""
    try {
      const slice = editor.state.doc.slice(from, to)
      const manager = editor.markdown
      if (manager?.serialize) {
        const json = { type: "doc", content: slice.content.toJSON() ?? [] }
        return manager.serialize(json as never) ?? ""
      }
    } catch {
      // fall back to plain text
    }
    return editor.state.doc.textBetween(from, to, "\n\n", "\n")
  }

  private async submit() {
    const editor = this.opts.editor
    const instruction = this.input.value.trim()
    if (!instruction) return

    const docSize = editor.state.doc.content.size
    const from = Math.max(0, Math.min(this.from, docSize))
    const to = Math.max(from, Math.min(this.to, docSize))
    const beforeFrom = Math.max(0, from - MARKDOWN_CONTEXT_CHARS)
    const afterTo = Math.min(docSize, to + MARKDOWN_CONTEXT_CHARS)

    const selection = this.serializeRange(from, to)
    const before = this.serializeRange(beforeFrom, from)
    const after = this.serializeRange(to, afterTo)

    const abort = new AbortController()
    this.abort = abort
    this.state = "streaming"
    this.replacement = ""
    this.preview.textContent = ""
    this.applyStrike()
    this.showPreview()
    this.setStatus("Generating…")
    this.setHint("Esc cancel")
    this.input.disabled = true

    try {
      await rewriteRequest({
        sdk: this.opts.sdk,
        path: this.opts.path,
        language: "markdown",
        before,
        selection,
        after,
        instruction,
        model: this.opts.model(),
        signal: abort.signal,
        onChunk: (chunk) => {
          if (this.disposed || abort.signal.aborted) return
          this.replacement += chunk
          this.preview.textContent = this.replacement
          this.position()
        },
      })
      if (this.disposed) return
      this.state = "awaiting"
      this.setStatus(undefined)
      this.setHint("Tab accept · Esc reject")
      this.input.disabled = true
      queueMicrotask(() => this.container.focus())
    } catch (err) {
      if (this.disposed) return
      if ((err as Error).name === "AbortError") {
        this.dispose()
        return
      }
      this.state = "error"
      this.setStatus((err as Error).message || "Request failed")
      this.setHint("Esc close")
      this.input.disabled = false
    }
  }

  private accept() {
    const editor = this.opts.editor
    const replacement = this.replacement
    // Remove the decoration plugin before applying the transaction so the decorations
    // don't linger on the pre-edit positions.
    this.removeStrike()
    const from = this.from
    const to = this.to
    this.dispose()
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, replacement, {
        parseOptions: { preserveWhitespace: "full" },
        contentType: "markdown",
      } as never)
      .run()
  }

  private reject() {
    this.dispose()
    queueMicrotask(() => this.opts.editor.commands.focus())
  }
}

interface MentionCallbacks {
  search: (query: string) => Promise<MentionItem[]>
  fetch: (id: string, type: string) => Promise<string | undefined>
  navigate: (attrs: { type: string; id: string }) => void
  onCreate?: (id: string) => Promise<string | undefined> | string | undefined
  onCreateEntity?: (opts: { name: string; type: string }) => Promise<string | undefined>
}

export interface MarkdownEditorRef {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export function MarkdownEditor(props: {
  path: string
  value: string
  active: boolean
  onChange: (value: string) => void
  mention?: MentionCallbacks
  ref?: (r: MarkdownEditorRef) => void
}) {
  let root: HTMLDivElement | undefined
  let editor: Rich | undefined
  let widget: MarkdownInlineEdit | undefined
  let sent = props.value
  const [canUndo, setCanUndo] = createSignal(false)
  const [canRedo, setCanRedo] = createSignal(false)

  const sdk = useGlobalSDK()
  const scopedSdk = useSDK()
  const local = useLocal()
  const data = useData()
  const models = useModels()

  const resolveWorkspacePath = (href: string) => {
    const next = href.split("#")[0]?.split("?")[0]?.trim()
    if (!next || /^(?:[a-z]+:|\/\/)/i.test(next)) return
    const full = next.replaceAll("\\", "/").replace(/\/+/g, "/")
    if (full.startsWith("/")) return full.replace(/^\/+/, "")
    const out = props.path.replaceAll("\\", "/").replace(/\/+/g, "/").split("/").slice(0, -1)
    for (const item of full.split("/")) {
      if (!item || item === ".") continue
      if (item === "..") {
        out.pop()
        continue
      }
      out.push(item)
    }
    return out.join("/")
  }

  const mountWhiteboardEmbed = createWhiteboardEmbedMount({
    fetchFile: async (path) => {
      const resolved = resolveWorkspacePath(path) ?? path
      const result = await scopedSdk.client.file.read({ path: resolved }).catch(() => undefined)
      const file = result?.data
      if (!file || file.type !== "text" || file.encoding === "base64") return undefined
      return file.content
    },
    onOpen: (path) => {
      const resolved = resolveWorkspacePath(path) ?? path
      props.mention?.navigate({ type: "file", id: resolved })
      dispatchProjectionFocus({ lens: "whiteboards", path: resolved })
    },
  })

  const uploadToServer = async (file: File): Promise<string | undefined> => {
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await sdk.fetch(`${sdk.url}/file/media`, { method: "POST", body: form })
      if (!res.ok) return undefined
      const json = (await res.json()) as { url?: string; path?: string }
      const src = json.url ?? json.path
      if (!src) return undefined
      return media(sdk.url, src)
    } catch {
      return undefined
    }
  }

  onMount(() => {
    if (!root) return
    editor = new Rich({
      content: decodeEntities(props.value),
      contentType: "markdown",
      editorProps: {
        attributes: {
          class: "h-full min-h-full outline-none cursor-text",
          "data-component": "markdown",
          spellcheck: "false",
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
            event.preventDefault()
            if (!editor) return true
            widget?.dispose()
            widget = new MarkdownInlineEdit({
              editor,
              path: props.path,
              sdk: scopedSdk,
              model: () => local.model.current(),
            })
            widget.open()
            return true
          }
          return false
        },
      },
      element: root,
      extensions: [
        Callout,
        Frontmatter.configure({ getModels: () => models.list().map((m) => `${m.provider.id}/${m.id}`) }),
        StarterKit.configure({ codeBlock: false }),
        CodeBlockHighlight,
        TableKit,
        ImageBlock.configure({
          upload: uploadToServer,
          resolve: (src) => media(sdk.url, src, data.directory),
          mountWhiteboardEmbed,
        }),
        SlashCommand,
        Mention.configure({
          onNavigate: (attrs) => props.mention?.navigate(attrs),
          onHover: undefined,
          onHoverEnd: undefined,
        }),
        MentionSuggestion.configure({
          char: "@",
          search: (query) => props.mention?.search(query) ?? Promise.resolve([]),
          onCreate: (id) => props.mention?.onCreate?.(id),
        }),
        MentionPreview.configure({
          fetch: (id, type) => props.mention?.fetch(id, type) ?? Promise.resolve(undefined),
          onNavigate: (attrs) => props.mention?.navigate(attrs),
        }),
        ImagePaste.configure({ save: uploadToServer }),
        MarkdownPaste,
        FileLink.configure({
          fetch: (path) => props.mention?.fetch(path, "file") ?? Promise.resolve(undefined),
          onNavigate: (path) => props.mention?.navigate({ type: "file", id: path }),
        }),
        LinkShortcut,
        MakeEntity.configure({
          onCreate: (opts) => props.mention?.onCreateEntity?.(opts) ?? Promise.resolve(undefined),
        }),
        Embed,
        TaskList,
        TaskItem.configure({ nested: true }),
        DragHandle,
        MarkdownExt,
      ],
      onCreate: () => {
        props.ref?.({
          undo: () => {
            editor?.chain().focus().undo().run()
            setCanUndo(editor?.can().undo() ?? false)
            setCanRedo(editor?.can().redo() ?? false)
          },
          redo: () => {
            editor?.chain().focus().redo().run()
            setCanUndo(editor?.can().undo() ?? false)
            setCanRedo(editor?.can().redo() ?? false)
          },
          canUndo: () => canUndo(),
          canRedo: () => canRedo(),
        })
      },
      onUpdate: ({ editor }) => {
        const md = editor.getMarkdown()
        sent = md
        props.onChange(md)
        setCanUndo(editor.can().undo())
        setCanRedo(editor.can().redo())
      },
    })
  })

  createEffect(() => {
    const value = props.value
    if (!editor) return
    if (value === sent) return
    sent = value
    editor.commands.setContent(decodeEntities(value), { contentType: "markdown" })
  })

  createEffect(
    on(
      () => props.active,
      (active, prev) => {
        if (!active || prev) return
        queueMicrotask(() => editor?.commands.focus())
      },
    ),
  )

  onCleanup(() => {
    widget?.dispose()
    editor?.destroy()
  })

  return (
    <div data-component="file-markdown" class="h-full min-h-0 flex flex-col">
      <div class="flex-1 min-h-0 overflow-auto">
        <div ref={root} data-component="file-markdown-editor" class="min-h-full" />
      </div>
    </div>
  )
}

function HtmlPreview(props: { value: string }) {
  return (
    <div class="h-full w-full overflow-auto bg-white">
      <iframe
        srcdoc={props.value}
        class="w-full h-full border-0"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-presentation allow-pointer-lock allow-downloads"
        allow="fullscreen; clipboard-read; clipboard-write"
      />
    </div>
  )
}

function WebViewer(props: { value: string; onChange: (value: string) => void }) {
  const preview = usePreview()
  const url = createMemo(() => props.value.trim())
  const [input, setInput] = createSignal(url())
  const [key, setKey] = createSignal(0)

  const [status, setStatus] = createSignal<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = createSignal<string>("")
  const [retryTick, setRetryTick] = createSignal(0)

  const frame = createMemo(() => {
    const src = url()
    const id = key()
    return src ? { src, id } : undefined
  })

  createEffect(() => setInput(url()))

  createEffect(() => {
    const targetUrl = url()
    retryTick() // track dependency

    if (!targetUrl) {
      setStatus("ready")
      return
    }

    setStatus("loading")
    setErrorMsg("")
    let active = true
    let attempt = 0

    const check = async () => {
      if (!active) return

      const svc = preview.services().find((s) => s.url === targetUrl || (s.port && targetUrl.includes(`:${s.port}`)))

      if (svc && svc.status === "error") {
        setStatus("error")
        setErrorMsg(svc.error || "Service crashed.")
        return
      }

      if (svc && svc.status === "stopped" && attempt === 0) {
        void preview.start(svc.name)
      }

      try {
        const res = await fetch(targetUrl, { mode: "cors" })
        if (res.status === 404 || res.status === 502 || res.status === 503) {
          throw new Error(`Server returned HTTP ${res.status}`)
        }
        setStatus("ready")
        return
      } catch (err: any) {
        if (!active) return

        if (err.name === "TypeError") {
          try {
            await fetch(targetUrl, { mode: "no-cors" })
            setStatus("ready")
            return
          } catch {
            // connection truly refused
          }
        }

        attempt++

        if (attempt > 20) {
          setStatus("error")
          setErrorMsg(err.message || "Connection refused.")
          return
        }

        setTimeout(check, 1000)
      }
    }

    void check()

    onCleanup(() => {
      active = false
    })
  })

  const navigate = () => {
    const v = input().trim()
    if (v && v !== url()) props.onChange(v)
    setKey((k) => k + 1)
    setRetryTick((k) => k + 1)
  }

  return (
    <div class="web-viewer">
      <div class="web-viewer-bar">
        <button
          class="web-viewer-action"
          onClick={() => {
            setKey((k) => k + 1)
            setRetryTick((k) => k + 1)
          }}
          title="Refresh"
        >
          <Icon name="refresh-cw" size="small" />
        </button>
        <input
          class="web-viewer-url"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate()
          }}
          spellcheck={false}
        />
        <button class="web-viewer-action" onClick={() => browse(url())} title="Open in preview">
          <Icon name="external-link" size="small" />
        </button>
      </div>
      <Switch>
        <Match when={status() === "loading"}>
          <div class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 text-text-weak mt-12">
            <Icon name="loader-2" class="animate-spin text-icon-weaker" size="large" />
            <span class="text-13-regular text-text-weaker">Starting server at {url()}...</span>
          </div>
        </Match>
        <Match when={status() === "error"}>
          <div class="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-text-weak p-8 text-center mt-8">
            <Icon name="octagon-alert" class="text-red-400 opacity-80 mb-2" size="large" />
            <span class="text-14-medium text-text-strong">Preview Failed</span>
            <span class="text-13-regular max-w-[300px] mb-4">{errorMsg()}</span>
            <Button variant="secondary" size="normal" onClick={() => setRetryTick((k) => k + 1)}>
              Retry Connection
            </Button>
          </div>
        </Match>
        <Match when={status() === "ready" && frame()}>
          {(item) => (
            <iframe
              src={item().src}
              class="web-viewer-frame block w-full h-full border-none bg-white flex-1 min-h-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="accelerometer; gyroscope; magnetometer; clipboard-read; clipboard-write; display-capture"
            />
          )}
        </Match>
        <Match when={!url()}>
          <div class="web-viewer-empty pt-20 flex justify-center h-full">
            <span class="text-text-weaker text-13-regular">Enter a URL above or write one to this .web file</span>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

const PDF_PRINT_STYLES = `
*, *::before, *::after { box-sizing: border-box; }
@page { size: A4; margin: 18mm 16mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
body {
  font: 11pt/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
main { max-width: 780px; margin: 0 auto; padding: 16px; }
h1, h2, h3, h4, h5, h6 { color: #000; font-weight: 600; line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 0.4em; }
h2 { font-size: 17pt; margin: 1.3em 0 0.4em; border-bottom: 1px solid #ddd; padding-bottom: 0.25em; }
h3 { font-size: 13pt; margin: 1.1em 0 0.35em; }
h4 { font-size: 11.5pt; margin: 1em 0 0.3em; }
h5, h6 { font-size: 11pt; margin: 0.9em 0 0.3em; color: #333; }
p { margin: 0 0 0.75em; }
a { color: #1a56db; text-decoration: underline; word-break: break-word; }
strong { font-weight: 600; color: #000; }
em { font-style: italic; }
ul, ol { padding-left: 1.3em; margin: 0.3em 0 0.85em; }
li { margin: 0.15em 0; }
li > p { margin: 0 0 0.25em; }
blockquote { margin: 0.9em 0; padding: 0.1em 0 0.1em 1em; border-left: 3px solid #ccc; color: #444; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.4em 0; }
code { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 0.92em; background: #f4f4f5; padding: 1px 4px; border-radius: 3px; }
pre { background: #f7f7f8; padding: 10px 12px; border-radius: 4px; border: 1px solid #eee; overflow: visible; white-space: pre-wrap; word-break: break-word; font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; line-height: 1.45; page-break-inside: avoid; margin: 0.6em 0 1em; }
pre code { background: transparent; padding: 0; border-radius: 0; font-size: inherit; }
pre .shiki, pre.shiki { background: transparent !important; padding: 0 !important; }
.shiki { font-family: inherit; }
table { border-collapse: collapse; width: 100%; margin: 0.9em 0; page-break-inside: avoid; font-size: 10pt; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f4f4f5; font-weight: 600; }
img { max-width: 100%; height: auto; page-break-inside: avoid; }
figure { margin: 1em 0; page-break-inside: avoid; }
figcaption { font-size: 9.5pt; color: #666; text-align: center; margin-top: 4px; }
input[type="checkbox"] { margin-right: 6px; }
.task-list-item, li[data-type="taskItem"] { list-style: none; margin-left: -1.2em; }
.frontmatter, .callout, .tiptap-callout { border: 1px solid #e2e2e2; background: #fafafa; border-radius: 6px; padding: 10px 14px; margin: 0.8em 0; page-break-inside: avoid; }
.callout.warning, .tiptap-callout[data-callout-type="warning"] { border-color: #facc15; background: #fefce8; }
.callout.note, .tiptap-callout[data-callout-type="note"] { border-color: #93c5fd; background: #eff6ff; }
.callout.danger, .tiptap-callout[data-callout-type="danger"] { border-color: #fca5a5; background: #fef2f2; }
.wiki-link { color: #6d28d9; text-decoration: none; border-bottom: 1px dotted #6d28d9; }
@media print { a { color: #1a56db; } pre, table, blockquote, figure, img { page-break-inside: avoid; } }
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

async function exportMarkdownToPdf(params: { title: string; html: string; autoPrint?: boolean }): Promise<boolean> {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100")
  if (!win) return false
  const titleText = escapeHtml(params.title)
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${titleText}</title>
<style>${PDF_PRINT_STYLES}</style>
</head>
<body>
<main>${params.html}</main>
<script>
window.addEventListener("load", () => {
  setTimeout(() => { try { window.focus(); window.print(); } catch (e) {} }, 120);
});
window.addEventListener("afterprint", () => { try { window.close(); } catch (e) {} });
</script>
</body>
</html>`
  win.document.open()
  win.document.write(doc)
  win.document.close()
  return true
}

function MarkdownWithFrontmatter(props: {
  path: string
  value: string
  active: boolean
  onChange: (value: string) => void
  mention?: MentionCallbacks
  onRef: (r: MarkdownEditorRef) => void
  frontmatterPanel?: boolean
}) {
  const split = createMemo(() => splitFrontmatter(props.value))

  const onBodyChange = (body: string) => {
    const meta = split().meta
    props.onChange(meta ? serializeFrontmatter(meta) + body : body)
  }

  const onMetaChange = (next: Record<string, unknown>) => {
    const body = split().body
    props.onChange(Object.keys(next).length > 0 ? serializeFrontmatter(next) + body : body)
  }

  return (
    <div data-component="markdown-with-frontmatter" class="flex h-full min-h-0">
      <div class="flex-1 min-h-0">
        <MarkdownEditor
          path={props.path}
          value={split().body}
          active={props.active}
          onChange={onBodyChange}
          mention={props.mention}
          ref={props.onRef}
        />
      </div>
      <Show when={props.frontmatterPanel !== false && split().meta}>
        {(meta) => (
          <FrontmatterPanel
            meta={meta()}
            onChange={onMetaChange}
            defaultOpen={Object.keys(meta()).length > 2}
          />
        )}
      </Show>
    </div>
  )
}

function splitFrontmatter(value: string): { meta: Record<string, unknown> | undefined; body: string } {
  const parsed = parseFrontmatter(value)
  if (!parsed) return { meta: undefined, body: value }
  return { meta: parsed.meta, body: parsed.body }
}

export function FileEditor(props: {
  path: string
  state: FileState
  value: string
  active: boolean
  onChange: (value: string) => void
  onSave: VoidFunction
  onMode: (value: "rich" | "raw") => void
  mention?: MentionCallbacks
  /** Side rail for YAML properties (off in graph entity sidebar — use Details tab). */
  frontmatterPanel?: boolean
}) {
  const sdk = useSDK()
  const intl = useLanguage()
  const marked = useMarked()
  const [pdfBusy, setPdfBusy] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [speech, setSpeech] = createSignal<TtsState>(ttsState())

  onMount(() => onTtsState(setSpeech))

  createEffect(
    on(
      () => props.path,
      () => stopTts(),
      { defer: true },
    ),
  )

  const md = createMemo(() => markdownMode(props.path))
  const csv = createMemo(() => csvMode(props.path))
  const web = createMemo(() => webMode(props.path))
  const html = createMemo(() => htmlMode(props.path))
  const base = createMemo(() => baseMode(props.path))
  const video = createMemo(() => videoMode(props.path))
  const image = createMemo(() => imageMode(props.path))
  const mediaSrc = createMemo(() => media(sdk.url, props.path, sdk.directory))
  const mode = createMemo(() => props.state.mode ?? "rich")
  const toggle = createMemo(() => md() || csv() || html() || base())
  let mdRef: MarkdownEditorRef | undefined

  const filename = createMemo(() => props.path.split("/").pop() ?? props.path)
  const filesize = createMemo(() => {
    const bytes = new Blob([props.value]).size
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  })
  const language = createMemo(() => {
    if (csv()) return "CSV"
    if (md()) return "Markdown"
    return monacoLanguage(props.path).toUpperCase()
  })

  const pdfTitle = createMemo(() => {
    const name = filename()
    const dot = name.lastIndexOf(".")
    return dot > 0 ? name.slice(0, dot) : name
  })

  const copyMarkdown = async () => {
    const content = props.value
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast({
        variant: "error",
        title: intl.t("session.fileTree.contextMenu.copyPath.failed"),
      })
    }
  }

  const speakMarkdown = () => {
    if (speech() !== "idle") {
      stopTts()
      return
    }
    const content = props.value
    if (!content) return
    void playTts(sdk.url, content, {
      onError: (message) => {
        showToast({
          title: intl.t("ui.message.speechFailed"),
          description: message === intl.t("ui.message.speechFailed") ? undefined : message,
          variant: "error",
          icon: "volume-2",
        })
      },
    })
  }

  const exportPdf = async () => {
    if (pdfBusy()) return
    setPdfBusy(true)
    try {
      const html = await Promise.resolve(marked.parse(props.value))
      const ok = await exportMarkdownToPdf({ title: pdfTitle(), html })
      if (!ok && typeof window !== "undefined") {
        window.alert("Unable to open print window. Please allow popups for this site to export PDF.")
      }
    } catch (err) {
      console.error("pdf export failed", err)
      if (typeof window !== "undefined") {
        window.alert(`PDF export failed: ${(err as Error)?.message ?? "unknown error"}`)
      }
    } finally {
      setPdfBusy(false)
    }
  }

  if (web()) {
    return (
      <div class="h-full min-h-0 flex flex-col relative">
        <WebViewer value={props.value} onChange={props.onChange} />
      </div>
    )
  }

  if (video()) {
    return (
      <div class="h-full min-h-0 flex items-center justify-center bg-black">
        <video src={mediaSrc()} controls autoplay class="max-h-full max-w-full" />
      </div>
    )
  }

  if (image()) {
    return (
      <div class="h-full min-h-0 flex items-center justify-center bg-background-stronger overflow-auto p-4">
        <img src={mediaSrc()} alt={props.path} class="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  return (
    <div class="h-full min-h-0 flex flex-col relative">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-weaker-base bg-transparent">
        <div class="flex items-center gap-3 min-w-0">
          <Show when={md() && mode() === "rich"}>
            <div class="flex items-center gap-1">
              <button
                class="flex items-center justify-center w-6 h-6 rounded hover:bg-surface-raised-base-hover disabled:opacity-40 disabled:cursor-not-allowed text-icon-weak hover:text-text-base transition-colors"
                disabled={!mdRef?.canUndo()}
                onClick={() => mdRef?.undo()}
                title="Undo (Cmd+Z)"
              >
                <Icon name="reset" size="small" />
              </button>
              <button
                class="flex items-center justify-center w-6 h-6 rounded hover:bg-surface-raised-base-hover disabled:opacity-40 disabled:cursor-not-allowed text-icon-weak hover:text-text-base transition-colors"
                disabled={!mdRef?.canRedo()}
                onClick={() => mdRef?.redo()}
                title="Redo (Cmd+Shift+Z)"
              >
                <Icon name="refresh-cw" size="small" class="scale-x-[-1]" />
              </button>
            </div>
          </Show>
          <span class="truncate text-13-medium text-text-strong" title={filename()}>
            {filename()}
          </span>
          <span class="text-12-regular text-text-weak flex-shrink-0">{filesize()}</span>
          <span class="text-12-regular text-text-weaker flex items-center justify-center flex-shrink-0 px-1.5 py-0.5 rounded border border-border-weaker-base bg-transparent">
            {language()}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Show when={props.state.saveError}>
            {(err) => <div class="truncate text-12-regular text-red-400 max-w-[200px]">{err()}</div>}
          </Show>
          <Show when={!props.state.saveError && props.state.stale}>
            <div class="truncate text-12-regular text-amber-400">Changed on disk</div>
          </Show>
          <Show when={md()}>
            <button
              class="flex items-center justify-center w-7 h-7 rounded-md border border-border-weaker-base bg-transparent text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={() => void copyMarkdown()}
              disabled={!props.value}
              title={copied() ? intl.t("ui.message.copied") : intl.t("ui.message.copy")}
              aria-label={copied() ? intl.t("ui.message.copied") : intl.t("ui.message.copy")}
            >
              <Icon name={copied() ? "check" : "copy"} size="small" />
            </button>
            <button
              class="flex items-center justify-center w-7 h-7 rounded-md border border-border-weaker-base bg-transparent text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={speakMarkdown}
              disabled={!props.value || speech() === "loading"}
              title={
                speech() === "playing"
                  ? intl.t("ui.message.stopSpeech")
                  : speech() === "loading"
                    ? intl.t("ui.message.preparingSpeech")
                    : intl.t("ui.message.readAloud")
              }
              aria-label={
                speech() === "idle"
                  ? intl.t("ui.message.readAloud")
                  : intl.t("ui.message.stopSpeech")
              }
            >
              <Show
                when={speech() !== "loading"}
                fallback={<Spinner style={{ width: "14px", height: "14px" }} class="text-icon-weaker" />}
              >
                <Icon name={speech() === "idle" ? "volume-2" : "stop"} size="small" />
              </Show>
            </button>
            <button
              class="flex items-center justify-center w-7 h-7 rounded-md border border-border-weaker-base bg-transparent text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={exportPdf}
              disabled={pdfBusy() || !props.value}
              title={pdfBusy() ? "Preparing PDF…" : "Export as PDF"}
              aria-label="Export as PDF"
            >
              <Icon name={pdfBusy() ? "loader-2" : "download"} size="small" class={pdfBusy() ? "animate-spin" : ""} />
            </button>
          </Show>
          <Show when={toggle()}>
            <div class="flex items-center rounded-md border border-border-weaker-base overflow-hidden bg-transparent">
              <button
                class={`flex items-center justify-center w-7 h-7 transition-colors ${mode() === "rich" ? "text-text-strong shadow-[inset_0_-1px_0_0_var(--text-strong)]" : "text-text-weak hover:text-text-base"}`}
                onClick={() => props.onMode("rich")}
                title={csv() ? "Table view" : html() ? "Preview" : base() ? "Base view" : "Rich editor"}
              >
                <Icon
                  name={csv() ? "table" : html() ? "globe" : base() ? "table" : "letter-text"}
                  size="small"
                />
              </button>
              <div style="width:1px;height:1rem;background:var(--border-weaker-base);flex-shrink:0" />
              <button
                class={`flex items-center justify-center w-7 h-7 transition-colors ${mode() === "raw" ? "text-text-strong shadow-[inset_0_-1px_0_0_var(--text-strong)]" : "text-text-weak hover:text-text-base"}`}
                onClick={() => props.onMode("raw")}
                title={csv() ? "Raw CSV" : html() ? "HTML source" : base() ? "YAML source" : "Markdown source"}
              >
                <Icon name="code" size="small" />
              </button>
            </div>
          </Show>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-hidden h-full">
        <Switch>
          <Match when={base()}>
            <div class="h-full min-h-0" classList={{ hidden: mode() !== "rich" }}>
              <BaseEditor path={props.path} value={props.value} active={props.active && mode() === "rich"} />
            </div>
            <div class="h-full min-h-0" classList={{ hidden: mode() !== "raw" }}>
              <CodeEditor path={props.path} value={props.value} active={props.active && mode() === "raw"} onChange={props.onChange} />
            </div>
          </Match>
          <Match when={csv() && mode() === "rich"}>
            <CsvViewer value={props.value} onChange={props.onChange} />
          </Match>
          <Match when={html() && mode() === "rich"}>
            <HtmlPreview value={props.value} />
          </Match>
          <Match when={!md() && !csv() && !web() && !html() && !base()}>
            <CodeEditor path={props.path} value={props.value} active={props.active} onChange={props.onChange} />
          </Match>
          <Match when={md() && mode() === "rich"}>
            <MarkdownWithFrontmatter
              path={props.path}
              value={props.value}
              active={props.active}
              onChange={props.onChange}
              mention={props.mention}
              frontmatterPanel={props.frontmatterPanel}
              onRef={(r) => {
                mdRef = r
              }}
            />
          </Match>
          <Match when={mode() === "raw" && !base()}>
            <CodeEditor path={props.path} value={props.value} active={props.active} onChange={props.onChange} />
          </Match>
        </Switch>
      </div>
    </div>
  )
}
