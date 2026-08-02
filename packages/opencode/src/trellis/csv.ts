export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') {
      if (cell.length === 0) {
        quoted = true
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      i++
      continue
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      i += ch === "\r" && input[i + 1] === "\n" ? 2 : 1
      continue
    }
    cell += ch
    i++
  }

  if (quoted) throw new Error("Unclosed quoted CSV field.")
  if (cell.length > 0 || row.length > 0 || input.endsWith(",")) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((item) => item.some((v) => v.trim() !== ""))
}
