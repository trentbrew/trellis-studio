import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createSignal } from "solid-js"

export function DialogAddLinkAsset(props: { onCreate: (input: { url: string; title?: string; description?: string }) => Promise<void> }) {
  const dialog = useDialog()
  const [url, setUrl] = createSignal("")
  const [title, setTitle] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal<string | undefined>()

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const href = url().trim()
    if (!href || busy()) return
    setBusy(true)
    setErr(undefined)
    try {
      await props.onCreate({
        url: href,
        title: title().trim() || undefined,
        description: description().trim() || undefined,
      })
      dialog.close()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Add link asset"
      description="Save a reusable bookmark as a Trellis Asset. No file is stored locally."
      class="w-full max-w-[480px] mx-auto"
    >
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <TextField
          autofocus
          type="url"
          label="URL"
          placeholder="https://example.com/docs"
          value={url()}
          onChange={(v) => {
            setUrl(v)
            setErr(undefined)
          }}
          error={err()}
          validationState={err() ? "invalid" : undefined}
        />
        <TextField
          type="text"
          label="Title"
          placeholder="Optional display title"
          value={title()}
          onChange={setTitle}
        />
        <textarea
          rows={3}
          placeholder="Optional description for agents and CMS editors..."
          value={description()}
          onInput={(e) => setDescription(e.currentTarget.value)}
          class="w-full bg-surface-raised-base border border-border-weaker-base rounded-md px-3 py-2 text-13-regular resize-none focus:ring-1 focus:ring-primary-base"
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={busy() || !url().trim()}>
            {busy() ? "Saving..." : "Add link"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
