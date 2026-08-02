import { createEffect, createSignal, Show } from "solid-js"

export function TypeRenameDialog(props: {
  open: boolean
  type: string | null
  label: string
  busy?: boolean
  onClose: () => void
  onSave: (label: string) => void
}) {
  const [value, setValue] = createSignal("")

  createEffect(() => {
    if (!props.open) return
    setValue(props.label)
  })

  const trimmed = () => value().trim()
  const unchanged = () => trimmed() === props.label.trim()
  const invalid = () => !trimmed()

  return (
    <Show when={props.open && props.type}>
      {(type) => (
        <div
          class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          onClick={props.onClose}
        >
          <form
            class="w-full max-w-md rounded-lg border border-border-weaker-base bg-background-base shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (props.busy || invalid() || unchanged()) return
              props.onSave(trimmed())
            }}
          >
            <div class="border-b border-border-weaker-base px-4 py-3">
              <div class="text-13-medium text-text-strong">Rename type</div>
              <div class="text-11-regular text-text-weaker mt-0.5 font-mono">{type()}</div>
            </div>
            <div class="px-4 py-3 flex flex-col gap-2">
              <label class="flex flex-col gap-1">
                <span class="text-11-medium text-text-weaker">Display name</span>
                <input
                  class="db-field-input"
                  type="text"
                  autofocus
                  value={value()}
                  disabled={props.busy}
                  onInput={(e) => setValue(e.currentTarget.value)}
                />
              </label>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-border-weaker-base px-4 py-3">
              <button type="button" class="db-action-btn" onClick={props.onClose}>
                Cancel
              </button>
              <button
                type="submit"
                class="db-action-btn db-action-btn--primary"
                disabled={props.busy || invalid() || unchanged()}
              >
                {props.busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Show>
  )
}
