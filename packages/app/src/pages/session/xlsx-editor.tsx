import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import "x-data-spreadsheet/dist/xspreadsheet.css"
import "x-data-spreadsheet/dist/xspreadsheet.js"
import * as XLSX from "xlsx"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { media } from "./media"
import { base64, dataToWorkbook, workbookToData, type SheetData } from "./xlsx-data"

type SheetStore = {
  dirty: boolean
  error?: string
  loading: boolean
}
type Book = {
  change: (cb: () => void) => Book
  getData: () => Record<string, unknown>[]
  loadData: (data: SheetData[]) => Book
}
type Factory = (el: HTMLElement, opts: Record<string, unknown>) => Book
type SheetWindow = Window & { x_spreadsheet?: unknown }

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function createSheet(el: HTMLElement, opts: Record<string, unknown>) {
  const factory = (window as SheetWindow).x_spreadsheet
  if (typeof factory !== "function") throw new Error("Spreadsheet editor failed to load")
  return (factory as Factory)(el, opts)
}

export function XlsxEditor(props: { active: boolean; path: string }) {
  const file = useFile()
  const sdk = useSDK()
  const [state, setState] = createStore<SheetStore>({ dirty: false, loading: true })
  let root: HTMLDivElement | undefined
  let book: Book | undefined
  let off: VoidFunction | undefined
  let seq = 0

  const save = async () => {
    if (!book) return false
    const out = XLSX.write(dataToWorkbook(book.getData() as SheetData[]), {
      bookType: props.path.toLowerCase().endsWith(".xls") ? "xls" : "xlsx",
      cellStyles: true,
      type: "array",
    }) as ArrayBuffer
    await sdk.client.file.write({
      fileWriteInput: {
        path: props.path,
        content: base64(out),
        encoding: "base64",
        mimeType: props.path.toLowerCase().endsWith(".xls") ? "application/vnd.ms-excel" : MIME,
        format: false,
      },
    })
    setState("dirty", false)
    return true
  }

  const load = async () => {
    if (!root) return
    const id = ++seq
    off?.()
    book = undefined
    root.textContent = ""
    setState({ dirty: false, error: undefined, loading: true })
    const res = await sdk.fetch(media(sdk.url, props.path, sdk.directory))
    if (!res.ok) throw new Error(`Unable to load workbook: ${res.status}`)
    const data = workbookToData(
      XLSX.read(await res.arrayBuffer(), { cellDates: true, cellStyles: true, type: "array" }),
    )
    if (id !== seq) return
    book = createSheet(root, {
      mode: "edit",
      showBottomBar: true,
      showContextmenu: true,
      showGrid: true,
      showToolbar: true,
      view: {
        height: () => root?.clientHeight ?? 600,
        width: () => root?.clientWidth ?? 900,
      },
    }).loadData(data)
    book.change(() => {
      if (state.dirty) return
      setState("dirty", true)
      file.touchState(props.path)
    })
    off = file.registerSave(props.path, { dirty: () => state.dirty, save })
    setState("loading", false)
  }

  createEffect(() => {
    props.path
    void load().catch((e) => {
      setState({ dirty: false, error: e instanceof Error ? e.message : String(e), loading: false })
      showToast({
        variant: "error",
        title: "Workbook load failed",
        description: e instanceof Error ? e.message : String(e),
      })
    })
  })

  onCleanup(() => {
    seq++
    off?.()
    if (root) root.textContent = ""
  })

  return (
    <div class="h-full min-h-0 flex flex-col bg-panel">
      <div class="h-10 flex items-center justify-between border-b border-border-weaker-base px-3 gap-3">
        <div class="min-w-0 flex items-center gap-2 text-13-regular">
          <Icon name="table" size="small" class="text-text-weak shrink-0" />
          <span class="truncate text-text-base">{props.path}</span>
          <Show when={state.dirty}>
            <span class="text-amber-400 shrink-0">Unsaved</span>
          </Show>
        </div>
        <Button
          size="small"
          variant="secondary"
          disabled={state.loading || !state.dirty}
          onClick={() => void file.save(props.path)}
        >
          Save
        </Button>
      </div>
      <div class="relative min-h-0 flex-1">
        <div ref={root} class="absolute inset-0 overflow-hidden" />
        <Show when={state.loading}>
          <div class="absolute inset-0 flex items-center justify-center bg-panel text-text-weak">
            Loading workbook...
          </div>
        </Show>
        <Show when={state.error}>
          {(err) => (
            <div class="absolute inset-0 flex items-center justify-center bg-panel text-red-400">
              {err()}
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

export default XlsxEditor
