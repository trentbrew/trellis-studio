import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { createSignal } from "solid-js"
import { apiErrorMessage } from "@/lib/api-error"
import type { ImageProvider } from "@/lib/media-generate"

export type { ImageProvider } from "@/lib/media-generate"

const PROVIDERS: { id: ImageProvider; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Prefer Gemini when configured; falls back to OpenAI if Gemini fails" },
  { id: "gemini", label: "Gemini", hint: "gemini-2.5-flash-image" },
  { id: "openai", label: "OpenAI", hint: "gpt-image-2 — needs OPENAI_API_KEY in project .env" },
]

export function DialogGenerateAsset(props: {
  onGenerate: (input: { prompt: string; provider: ImageProvider }) => Promise<void>
}) {
  const dialog = useDialog()
  const [prompt, setPrompt] = createSignal("")
  const [provider, setProvider] = createSignal<ImageProvider>("auto")
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal<string | undefined>()

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const text = prompt().trim()
    if (!text || busy()) return
    setBusy(true)
    setErr(undefined)
    try {
      await props.onGenerate({ prompt: text, provider: provider() })
      dialog.close()
    } catch (e) {
      setErr(e instanceof Error ? e.message : apiErrorMessage(e, "Image generation failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Generate image asset"
      description="Describe the image you want. It will be saved to .trellis/media."
      class="w-full max-w-[480px] mx-auto"
    >
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <textarea
          autofocus
          rows={4}
          placeholder="A cute turtle riding a snowboard down a snowy slope..."
          value={prompt()}
          onInput={(e) => {
            setPrompt(e.currentTarget.value)
            setErr(undefined)
          }}
          class="w-full bg-surface-raised-base border border-border-weaker-base rounded-md px-3 py-2 text-13-regular resize-none focus:ring-1 focus:ring-primary-base"
        />
        {err() ? <div class="text-12-regular text-text-destructive">{err()}</div> : null}
        <div class="flex items-end justify-between gap-4">
          <div class="flex min-w-0 flex-col gap-1.5">
            <label class="text-12-medium text-text-weak">Provider</label>
            <RadioGroup
              options={PROVIDERS}
              current={PROVIDERS.find((item) => item.id === provider()) ?? PROVIDERS[0]}
              value={(item) => item.id}
              label={(item) => item.label}
              onSelect={(item) => {
                if (item) setProvider(item.id)
                setErr(undefined)
              }}
              size="small"
              fill
              class="w-full max-w-[20rem]"
            />
            <p class="text-11-regular text-text-weaker">
              {PROVIDERS.find((item) => item.id === provider())?.hint}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="large" disabled={busy() || !prompt().trim()}>
              {busy() ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
