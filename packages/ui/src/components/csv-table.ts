import Papa from "papaparse"

export type CsvData = {
  headers: string[]
  rows: string[][]
}

export function parseCsv(text: string): CsvData | undefined {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: true,
  })
  if (!result.data || result.data.length < 1) return undefined
  const [headers, ...rows] = result.data
  if (!headers || headers.length === 0) return undefined
  return { headers, rows }
}

export function serializeCsv(data: CsvData): string {
  return Papa.unparse([data.headers, ...data.rows])
}

export function renderHtml(data: CsvData, sortCol?: number, asc = true): string {
  const sorted = sortCol != null ? sortRows(data.rows, sortCol, asc) : data.rows
  const ths = data.headers.map((h, i) => `<th data-slot="csv-th" data-col="${i}">${esc(h)}</th>`).join("")
  const trs = sorted
    .map((row) => `<tr>${row.map((cell) => `<td data-slot="csv-td">${esc(cell)}</td>`).join("")}</tr>`)
    .join("")
  return `<div data-component="csv-table"><table data-slot="csv-table-inner"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
}

function sortRows(rows: string[][], col: number, asc: boolean) {
  return [...rows].sort((a, b) => {
    const va = a[col] ?? ""
    const vb = b[col] ?? ""
    const na = Number(va)
    const nb = Number(vb)
    if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na
    return asc ? va.localeCompare(vb) : vb.localeCompare(va)
  })
}

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
