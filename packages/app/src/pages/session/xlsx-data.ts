import * as XLSX from "xlsx"
import type { CellObject, WorkBook, WorkSheet } from "xlsx"

type Color = { rgb?: string }
type SourceStyle = {
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean }
  fill?: { fgColor?: Color }
  font?: { bold?: boolean; color?: Color; italic?: boolean; name?: string; sz?: number; underline?: boolean }
}
export type SheetStyle = {
  align?: "left" | "center" | "right"
  bgcolor?: string
  color?: string
  font?: { bold?: boolean; italic?: boolean; name?: string; size?: number }
  textwrap?: boolean
  underline?: boolean
  valign?: "top" | "middle" | "bottom"
}
export type SheetCell = { merge?: [number, number]; style?: number; text?: string }
export type SheetRow = { cells?: Record<string, SheetCell>; height?: number }
export type SheetCol = { width?: number }
export type SheetData = {
  cols?: Record<string, SheetCol | number>
  merges?: string[]
  name?: string
  rows?: Record<string, SheetRow | number>
  styles?: SheetStyle[]
}

function hex(color: Color | undefined) {
  if (!color?.rgb) return
  const value = color.rgb.slice(-6)
  return value.length === 6 ? `#${value}` : undefined
}

function align(value: string | undefined): SheetStyle["align"] {
  if (value === "center" || value === "right") return value
  if (value === "left") return value
}

function valign(value: string | undefined): SheetStyle["valign"] {
  if (value === "top" || value === "middle" || value === "bottom") return value
}

function styleIndex(cell: CellObject, styles: SheetStyle[]) {
  const src = cell.s as SourceStyle | undefined
  if (!src) return
  const next: SheetStyle = {}
  const horizontal = align(src.alignment?.horizontal)
  const vertical = valign(src.alignment?.vertical)
  const bgcolor = hex(src.fill?.fgColor)
  const color = hex(src.font?.color)
  if (horizontal) next.align = horizontal
  if (vertical) next.valign = vertical
  if (bgcolor) next.bgcolor = bgcolor
  if (color) next.color = color
  if (src.alignment?.wrapText) next.textwrap = true
  if (src.font?.underline) next.underline = true
  if (src.font?.bold || src.font?.italic || src.font?.name || src.font?.sz) {
    next.font = {
      ...(src.font.bold ? { bold: true } : {}),
      ...(src.font.italic ? { italic: true } : {}),
      ...(src.font.name ? { name: src.font.name } : {}),
      ...(src.font.sz ? { size: src.font.sz } : {}),
    }
  }
  if (Object.keys(next).length === 0) return
  const key = JSON.stringify(next)
  const idx = styles.findIndex((item) => JSON.stringify(item) === key)
  if (idx >= 0) return idx
  styles.push(next)
  return styles.length - 1
}

function text(cell: CellObject) {
  if (cell.f) return `=${cell.f}`
  if (cell.w) return cell.w
  if (cell.v === undefined) return ""
  return String(cell.v)
}

export function workbookToData(book: WorkBook): SheetData[] {
  return book.SheetNames.map((name) => {
    const ws = book.Sheets[name]
    const styles: SheetStyle[] = []
    const rows: Record<string, SheetRow | number> = {}
    const cols: Record<string, SheetCol | number> = {}
    const merges = (ws?.["!merges"] ?? []).map((range) => XLSX.utils.encode_range(range))
    const ref = ws?.["!ref"]
    if (!ws || !ref) return { name, rows, styles, merges }
    const range = XLSX.utils.decode_range(ref)
    rows.len = range.e.r + 1
    ;(ws["!cols"] ?? []).forEach((col, idx) => {
      if (!col) return
      const width = col.wpx ?? (col.wch ? col.wch * 8 : undefined)
      if (width) cols[idx] = { width }
    })
    ;(ws["!rows"] ?? []).forEach((row, idx) => {
      if (!row?.hpx) return
      rows[idx] = { ...((typeof rows[idx] === "object" ? rows[idx] : {}) as SheetRow), height: row.hpx }
    })
    Object.entries(ws).forEach(([addr, value]) => {
      if (addr.startsWith("!")) return
      const cell = value as CellObject
      const pos = XLSX.utils.decode_cell(addr)
      const row = typeof rows[pos.r] === "object" ? (rows[pos.r] as SheetRow) : {}
      const data: SheetCell = { text: text(cell) }
      const idx = styleIndex(cell, styles)
      if (idx !== undefined) data.style = idx
      const merge = ws["!merges"]?.find((item) => item.s.r === pos.r && item.s.c === pos.c)
      if (merge) data.merge = [merge.e.r - merge.s.r, merge.e.c - merge.s.c]
      row.cells = { ...(row.cells ?? {}), [pos.c]: data }
      rows[pos.r] = row
    })
    return { cols, merges, name, rows, styles }
  })
}

function value(input: string) {
  const trimmed = input.trim()
  if (trimmed === "TRUE") return { t: "b" as const, v: true }
  if (trimmed === "FALSE") return { t: "b" as const, v: false }
  if (trimmed !== "" && String(Number(trimmed)) === trimmed) return { t: "n" as const, v: Number(trimmed) }
  return { t: "s" as const, v: input }
}

function source(style: SheetStyle | undefined) {
  if (!style) return
  return {
    alignment: {
      ...(style.align ? { horizontal: style.align } : {}),
      ...(style.valign ? { vertical: style.valign } : {}),
      ...(style.textwrap ? { wrapText: true } : {}),
    },
    ...(style.bgcolor ? { fill: { fgColor: { rgb: style.bgcolor.replace("#", "") } } } : {}),
    font: {
      ...(style.color ? { color: { rgb: style.color.replace("#", "") } } : {}),
      ...(style.font?.bold ? { bold: true } : {}),
      ...(style.font?.italic ? { italic: true } : {}),
      ...(style.font?.name ? { name: style.font.name } : {}),
      ...(style.font?.size ? { sz: style.font.size } : {}),
      ...(style.underline ? { underline: true } : {}),
    },
  }
}

function ref(cells: XLSX.CellAddress[]) {
  return XLSX.utils.encode_range({
    s: {
      c: Math.min(...cells.map((item) => item.c)),
      r: Math.min(...cells.map((item) => item.r)),
    },
    e: {
      c: Math.max(...cells.map((item) => item.c)),
      r: Math.max(...cells.map((item) => item.r)),
    },
  })
}

function worksheet(sheet: SheetData): WorkSheet {
  const ws: WorkSheet = {}
  const cells: XLSX.CellAddress[] = []
  const merges = new Set(sheet.merges ?? [])
  Object.entries(sheet.rows ?? {}).forEach(([ri, row]) => {
    if (ri === "len" || typeof row !== "object") return
    Object.entries(row.cells ?? {}).forEach(([ci, cell]) => {
      const pos = { r: Number(ri), c: Number(ci) }
      const addr = XLSX.utils.encode_cell(pos)
      const raw = cell.text ?? ""
      ws[addr] = raw.startsWith("=") ? ({ t: "n", f: raw.slice(1) } as CellObject) : ({ ...value(raw) } as CellObject)
      const styled = source(sheet.styles?.[cell.style ?? -1])
      if (styled) ws[addr].s = styled
      if (cell.merge) {
        merges.add(XLSX.utils.encode_range({ s: pos, e: { r: pos.r + cell.merge[0], c: pos.c + cell.merge[1] } }))
      }
      cells.push(pos)
    })
  })
  if (cells.length > 0) ws["!ref"] = ref(cells)
  ws["!merges"] = Array.from(merges).map((item) => XLSX.utils.decode_range(item))
  ws["!cols"] = Object.entries(sheet.cols ?? [])
    .filter(([key, col]) => key !== "len" && typeof col === "object" && col.width)
    .map(([, col]) => ({ wpx: (col as SheetCol).width }))
  ws["!rows"] = Object.entries(sheet.rows ?? [])
    .filter(([key, row]) => key !== "len" && typeof row === "object" && row.height)
    .map(([, row]) => ({ hpx: (row as SheetRow).height }))
  return ws
}

export function dataToWorkbook(data: SheetData[]) {
  const book = XLSX.utils.book_new()
  data.forEach((sheet, idx) => {
    XLSX.utils.book_append_sheet(book, worksheet(sheet), sheet.name || `Sheet${idx + 1}`)
  })
  return book
}

export function base64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  const size = 0x8000
  return btoa(
    Array.from({ length: Math.ceil(bytes.length / size) }, (_, idx) =>
      String.fromCharCode(...bytes.subarray(idx * size, idx * size + size)),
    ).join(""),
  )
}
