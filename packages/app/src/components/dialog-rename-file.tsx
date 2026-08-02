import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import { createSignal } from "solid-js"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"

function parent(p: string) {
  const idx = p.lastIndexOf("/")
  return idx === -1 ? "" : p.slice(0, idx)
}

export function DialogRenameFile(props: {
  path: string
  kind: "file" | "dir"
  /** When set, the final filename is forced to end with this suffix (e.g. `.whiteboard`). */
  enforceExtension?: string
  onRenamed?: (to: string) => void
}) {
  const dialog = useDialog()
  const file = useFile()
  const language = useLanguage()

  const initialName = () => {
    const base = getFilename(props.path)
    const ext = props.enforceExtension
    if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
      return base.slice(0, -ext.length) || base
    }
    return base
  }
  const [name, setName] = createSignal(initialName())
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal<string | undefined>()

  const dir = parent(props.path)
  const target = () => {
    let n = name().trim().replace(/^\/+|\/+$/g, "")
    if (!n) return ""
    const ext = props.enforceExtension
    if (ext) {
      const lower = ext.toLowerCase()
      if (!n.toLowerCase().endsWith(lower)) {
        const base = n.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "")
        n = `${base}${ext}`
      }
    }
    return dir ? `${dir}/${n}` : n
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy()) return
    const to = target()
    if (!to) {
      setErr(language.t("dialog.newEntry.error.empty"))
      return
    }
    if (to.split("/").some((seg) => !seg || seg === "." || seg === "..")) {
      setErr(language.t("dialog.newEntry.error.invalid"))
      return
    }
    if (to === props.path) {
      dialog.close()
      return
    }
    setBusy(true)
    setErr(undefined)
    try {
      await file.rename(props.path, to)
      props.onRenamed?.(to)
      dialog.close()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      showToast({
        variant: "error",
        title: language.t("session.fileTree.contextMenu.rename"),
        description: msg,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={language.t("session.fileTree.contextMenu.rename")} class="w-full max-w-[440px] mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <div class="text-12-regular text-text-weak truncate">{dir ? `${dir}/` : ""}</div>
        <TextField
          autofocus
          type="text"
          label={language.t("dialog.newEntry.name")}
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
            {busy() ? language.t("common.saving") : language.t("common.rename")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
