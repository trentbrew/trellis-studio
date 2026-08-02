import { createMemo, createSignal, For, Show } from "solid-js"
import { parseCsv, serializeCsv, type CsvData } from "@opencode-ai/ui/csv-table"

export function CsvViewer(props: { value: string; onChange?: (value: string) => void }) {
  const editable = () => !!props.onChange
  const [col, setCol] = createSignal<number | undefined>(undefined)
  const [asc, setAsc] = createSignal(true)
  const [editing, setEditing] = createSignal<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = createSignal("")

  const data = createMemo(() => parseCsv(props.value))

  const sorted = createMemo(() => {
    const d = data()
    if (!d) return undefined
    const c = col()
    if (c == null) return d
    const rows = [...d.rows].sort((a, b) => {
      const va = a[c] ?? ""
      const vb = b[c] ?? ""
      const na = Number(va)
      const nb = Number(vb)
      if (!isNaN(na) && !isNaN(nb)) return asc() ? na - nb : nb - na
      return asc() ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return { headers: d.headers, rows } satisfies CsvData
  })

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    if (!props.onChange) return
    const d = data()
    if (!d) return
    const newRows = d.rows.map((row, ri) =>
      ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? value : cell)) : row,
    )
    props.onChange(serializeCsv({ headers: d.headers, rows: newRows }))
    setEditing(null)
  }

  const startEdit = (row: number, col: number, value: string) => {
    if (!editable()) return
    setEditing({ row, col })
    setEditValue(value)
  }

  const toggle = (idx: number) => {
    if (col() === idx) {
      setAsc(!asc())
    } else {
      setCol(idx)
      setAsc(true)
    }
  }

  return (
    <Show
      when={sorted()}
      fallback={<div class="h-full flex items-center justify-center text-text-weak">Unable to parse CSV</div>}
    >
      {(d) => (
        <div data-component="csv-table-editor" class="h-full overflow-auto">
          <table data-slot="csv-table-inner" class="w-full border-collapse text-13-regular">
            <thead class="sticky top-0 z-10">
              <tr>
                <For each={d().headers}>
                  {(header, idx) => (
                    <th
                      data-slot="csv-th"
                      class="px-3 py-2 text-left font-medium text-text-base border-b border-border-weaker-base cursor-pointer select-none hover:bg-surface-raised-base/20 transition-colors"
                      onClick={() => toggle(idx())}
                    >
                      <span class="inline-flex items-center gap-1">
                        {header}
                        <Show when={col() === idx()}>
                          <span class="text-text-weak">{asc() ? "↑" : "↓"}</span>
                        </Show>
                      </span>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={d().rows}>
                {(row, ri) => (
                  <tr class="bg-transparent">
                    <For each={row}>
                      {(cell, ci) => {
                        const isEditing = () => editing()?.row === ri() && editing()?.col === ci()
                        return (
                          <td
                            data-slot="csv-td"
                            class="px-3 py-1.5 text-text-base border-b border-border-weaker-base whitespace-nowrap bg-transparent"
                            onDblClick={() => startEdit(ri(), ci(), cell)}
                          >
                            <Show when={isEditing()} fallback={cell}>
                              <input
                                type="text"
                                value={editValue()}
                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                onBlur={() => updateCell(ri(), ci(), editValue())}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") updateCell(ri(), ci(), editValue())
                                  if (e.key === "Escape") setEditing(null)
                                }}
                                class="bg-transparent border border-border-weak-base rounded px-1.5 py-0.5 text-13-regular text-text-base outline-none focus:border-border-base w-full min-w-[60px]"
                                autofocus
                              />
                            </Show>
                          </td>
                        )
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      )}
    </Show>
  )
}
