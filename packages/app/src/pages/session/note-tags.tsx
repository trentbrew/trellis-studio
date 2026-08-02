import { createSignal, For, Show } from "solid-js"
import { X } from "lucide-solid"
import { normalizeNoteTag } from "@/lib/projections/notes-model"

export function NoteTags(props: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = createSignal("")

  const addTag = (raw: string) => {
    const tag = normalizeNoteTag(raw)
    if (!tag) return
    if (props.tags.includes(tag)) {
      setDraft("")
      return
    }
    if (props.tags.length >= 12) return
    props.onChange([...props.tags, tag])
    setDraft("")
  }

  const removeTag = (tag: string) => {
    props.onChange(props.tags.filter((item) => item !== tag))
  }

  return (
    <div class="note-tags">
      <For each={props.tags}>
        {(tag) => (
          <span class="note-tag">
            {tag}
            <button type="button" class="note-tag-remove" aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)}>
              <X class="size-3" />
            </button>
          </span>
        )}
      </For>
      <Show when={props.tags.length < 12}>
        <input
          class="note-tags-input"
          value={draft()}
          placeholder={props.tags.length ? "Add tag…" : "Add tags…"}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              addTag(draft())
            }
            if (event.key === "Backspace" && !draft() && props.tags.length) {
              removeTag(props.tags[props.tags.length - 1]!)
            }
          }}
          onBlur={() => {
            if (draft().trim()) addTag(draft())
          }}
        />
      </Show>
    </div>
  )
}
