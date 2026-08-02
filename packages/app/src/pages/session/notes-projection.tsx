import { createMemo, For, onCleanup, onMount, createSignal, Show } from "solid-js"
import { Plus, StickyNote } from "lucide-solid"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import {
  formatNoteTime,
  listNotes,
  plainNotePreview,
} from "@/lib/projections/notes-model"
import { apiSaveNote } from "@/lib/projections/notes-api"
import { PROJECTION_FOCUS_EVENT, type ProjectionFocusDetail } from "@/lib/projection-focus"
import { AffordanceShell } from "@/components/affordance"
import { RouteEmptyState } from "@/components/route"
import { useEntityDialog } from "@/components/entity-dialog"
import "./notes-projection.css"

function NoteRichPreview(props: { content: string }) {
  return (
    <Show
      when={props.content.trim()}
      fallback={<div class="text-12-regular text-text-weaker">{plainNotePreview(props.content)}</div>}
    >
      <div class="note-rich-preview">
        <Markdown text={props.content.slice(0, 1200)} class="text-12-regular" />
      </div>
    </Show>
  )
}

function NotesProjectionInner() {
  const sdk = useSDK()
  const entity = useEntityDialog()
  const store = useTrellisStore()
  const notes = createMemo(() => listNotes(store.entities, store.facts))
  const [creating, setCreating] = createSignal(false)
  const activeNoteId = createMemo(() => {
    const stack = entity.stack()
    const top = stack[stack.length - 1]
    return top?.type === "note" ? top.id : null
  })

  const openNote = (id: string) => {
    entity.push(id, "note")
  }

  onMount(() => {
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectionFocusDetail>).detail
      if (detail?.lens !== "notes" || !detail.entityId) return
      if (notes().some((note) => note.id === detail.entityId)) {
        openNote(detail.entityId)
      }
    }
    window.addEventListener(PROJECTION_FOCUS_EVENT, focus)
    onCleanup(() => window.removeEventListener(PROJECTION_FOCUS_EVENT, focus))
  })

  const createNote = async () => {
    const id = `note:${crypto.randomUUID()}`
    setCreating(true)
    try {
      await apiSaveNote(sdk.fetch, sdk.url, sdk.directory, { id, content: "", tags: [] })
      await store.refresh(false)
      openNote(id)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to create note",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <AffordanceShell
      id="notes"
      title="Notes"
      viewClass="notes-projection"
      padded={false}
      addLabel="New note"
      onAdd={() => void createNote()}
    >
      <Show
        when={notes().length > 0}
        fallback={
          <RouteEmptyState
            icon={<StickyNote class="size-8" />}
            title="Capture a thought"
            description="Keep-style notes live here — no folders, no filenames upfront. Start writing and the title takes care of itself."
            action={
              <Button variant="primary" disabled={creating()} onClick={() => void createNote()}>
                <Plus class="size-3.5 mr-1.5" />
                New note
              </Button>
            }
          />
        }
      >
        <div class="notes-grid">
          <For each={notes()}>
            {(note, idx) => (
              <article
                class="note-card stagger-item"
                classList={{
                  selected: activeNoteId() === note.id,
                  "fresh-overlay": store.fresh.includes(note.id),
                }}
                style={{ "animation-delay": `${idx() * 30}ms` }}
                onClick={() => openNote(note.id)}
              >
                <div class="note-card-preview">
                  <NoteRichPreview content={note.content} />
                </div>
                <Show when={note.tags.length > 0}>
                  <div class="note-card-tags">
                    <For each={note.tags.slice(0, 3)}>
                      {(tag) => <span class="note-card-tag">{tag}</span>}
                    </For>
                    <Show when={note.tags.length > 3}>
                      <span class="note-card-tag note-card-tag--more">+{note.tags.length - 3}</span>
                    </Show>
                  </div>
                </Show>
                <div class="note-card-foot">
                  <div class="note-card-title">{note.title}</div>
                  <div class="note-card-time">{formatNoteTime(note.updatedAt)}</div>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </AffordanceShell>
  )
}

export function NotesProjection() {
  return (
    <TrellisStoreScope>
      <NotesProjectionInner />
    </TrellisStoreScope>
  )
}
