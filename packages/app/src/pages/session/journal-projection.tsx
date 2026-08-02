import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { BookOpenText, FileText } from "lucide-solid"
import { AffordanceShell } from "@/components/affordance"
import { RouteEmptyState } from "@/components/route"
import { useFile } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useParams } from "@solidjs/router"

type Entry = {
  path: string
  date: string
}

function date(path: string) {
  return path.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? path
}

function title(day: string) {
  const value = new Date(`${day}T00:00:00`)
  if (Number.isNaN(value.getTime())) return day
  return value.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

export function JournalProjection() {
  const file = useFile()
  const layout = useLayout()
  const params = useParams()
  const [items, setItems] = createSignal<Entry[]>([])

  const load = async () => {
    const paths = await file.searchFiles("journal")
    setItems(
      paths
        .filter((path) => /^journal\/\d{4}-\d{2}-\d{2}\.md$/i.test(path))
        .map((path) => ({ path, date: date(path) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    )
  }

  const open = (path: string) => {
    const tab = file.tab(path)
    file.load(path)
    const tabs = layout.tabs(params.dir ?? "")
    tabs.open(tab)
    tabs.setActive(tab)
    if (!layout.view(params.dir ?? "").reviewPanel.opened()) layout.view(params.dir ?? "").reviewPanel.open()
  }

  onMount(() => {
    void load()
    const id = window.setInterval(() => void load(), 15_000)
    onCleanup(() => window.clearInterval(id))
  })

  return (
    <AffordanceShell
      id="journal"
      title="Journal"
      onRefresh={() => void load()}
      refreshTitle="Refresh journal"
      contentClass="space-y-3"
    >
      <Show
        when={items().length > 0}
        fallback={
          <RouteEmptyState
            icon={<BookOpenText class="size-8" />}
            title="No journal entries"
            description="Create a journal entry to start the daily journal."
          />
        }
      >
        <div class="grid gap-2">
          <For each={items()}>
            {(entry) => (
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-md border border-border-weaker-base bg-well px-3 py-2 text-left hover:border-border-base hover:bg-subtle"
                onClick={() => open(entry.path)}
              >
                <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-text-base">
                  <FileText class="size-4" />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-13-medium text-text-strong">{title(entry.date)}</span>
                  <span class="block truncate font-mono text-11-regular text-text-weaker">{entry.path}</span>
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </AffordanceShell>
  )
}
