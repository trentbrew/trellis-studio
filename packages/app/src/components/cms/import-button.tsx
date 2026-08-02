import { createSignal } from "solid-js"
import { Upload } from "lucide-solid"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { trellisUrl } from "@/context/trellis"
import type { Collection } from "@/components/cms/collections-sidebar"

export type CsvImportResult = {
  collection: string
  imported: number
  facts: number
  retracted: number
  fields: string[]
  ids: string[]
  schema: { created: boolean; extended: string[] }
  warnings: string[]
}

function failure(status: number, body: string) {
  if (!body) return `Import failed (${status})`
  try {
    const parsed = JSON.parse(body) as { error?: unknown; reason?: unknown }
    if (typeof parsed.reason === "string") return parsed.reason
    if (typeof parsed.error === "string") return parsed.error
  } catch {
    return body
  }
  return body
}

export function CsvImportButton(props: {
  collection: Pick<Collection, "key" | "label">
  onImported: (result: CsvImportResult) => Promise<void> | void
}) {
  const sdk = useSDK()
  const [busy, setBusy] = createSignal(false)
  let input: HTMLInputElement | undefined

  const submit = async (file: File) => {
    setBusy(true)
    try {
      const res = await sdk.fetch(trellisUrl(sdk.url, sdk.directory, "/import/csv"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: await file.text(),
          collection: props.collection.key,
          label: props.collection.label,
          schema: "extend",
          status: "draft",
        }),
      })
      const body = await res.text()
      if (!res.ok) throw new Error(failure(res.status, body))
      const result = JSON.parse(body) as CsvImportResult
      showToast({
        variant: "success",
        title: `Imported ${result.imported} ${result.imported === 1 ? "row" : "rows"}`,
        description: result.schema.extended.length
          ? `Added ${result.schema.extended.length} ${result.schema.extended.length === 1 ? "field" : "fields"}`
          : undefined,
      })
      await props.onImported(result)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
      if (input) input.value = ""
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        class="hidden"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void submit(file)
        }}
      />
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md bg-surface-raised-base/0 px-2.5 py-1.5 text-12-medium text-text-base hover:bg-surface-raised-base/80 disabled:pointer-events-none disabled:opacity-50"
        disabled={busy()}
        onClick={() => input?.click()}
        title="Import CSV"
      >
        <Upload class="size-3.5" />
        <span>{busy() ? "Importing" : "Import CSV"}</span>
      </button>
    </>
  )
}
