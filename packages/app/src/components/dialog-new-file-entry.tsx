import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createSignal, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"

type Kind = "file" | "folder"

export function DialogNewFileEntry(props: {
  kind: Kind
  baseDir?: string
  onCreated?: (path: string, kind: Kind) => void
}) {
  const dialog = useDialog()
  const sdk = useSDK()
  const file = useFile()
  const language = useLanguage()

  const baseDir = () => (props.baseDir ?? "").replace(/^\/+|\/+$/g, "")
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal<string | undefined>()

  const relPath = () => {
    const n = name().trim().replace(/^\/+|\/+$/g, "")
    if (!n) return ""
    return baseDir() ? `${baseDir()}/${n}` : n
  }

  const title =
    props.kind === "file"
      ? language.t("session.fileTree.newFile")
      : language.t("session.fileTree.newFolder")

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy()) return
    const rel = relPath()
    if (!rel) {
      setErr(language.t("dialog.newEntry.error.empty"))
      return
    }
    if (rel.split("/").some((seg) => !seg || seg === "." || seg === "..")) {
      setErr(language.t("dialog.newEntry.error.invalid"))
      return
    }
    setBusy(true)
    setErr(undefined)
    try {
      if (props.kind === "file") {
        await sdk.client.file.write({
          fileWriteInput: { path: rel, content: "", format: false },
        })
      } else {
        const abs = `${sdk.directory.replace(/\/+$/, "")}/${rel}`
        await sdk.client.global.mkdir({ path: abs })
      }
      const parent = baseDir()
      await file.tree.refresh(parent)
      if (parent) file.tree.expand(parent)
      props.onCreated?.(rel, props.kind)
      dialog.close()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      showToast({ variant: "error", title, description: msg })
    } finally {
      setBusy(false)
    }
  }

  const placeholder =
    props.kind === "file"
      ? language.t("dialog.newEntry.placeholder.file")
      : language.t("dialog.newEntry.placeholder.folder")

  return (
    <Dialog title={title} class="w-full max-w-[440px] mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <Show when={baseDir()}>
          <div class="text-12-regular text-text-weak truncate">{baseDir()}/</div>
        </Show>
        <TextField
          autofocus
          type="text"
          label={language.t("dialog.newEntry.name")}
          placeholder={placeholder}
          value={name()}
          onChange={(v) => {
            setName(v)
            setErr(undefined)
          }}
          error={err()}
          validationState={err() ? "invalid" : undefined}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={busy() || !name().trim()}>
            {busy() ? language.t("common.saving") : language.t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
