import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

interface DialogCreateProjectProps {
  onSelect: (result: string | string[] | null) => void
  multiple?: boolean
}

export function DialogCreateProject(props: DialogCreateProjectProps) {
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const language = useLanguage()

  const home = () => sync.data.path.home || ""
  const base = () => home() + "/.turtlecode"

  const [store, setStore] = createStore({
    name: "",
    busy: false,
  })
  const [showClone, setShowClone] = createSignal(false)

  function openCloneDialog() {
    setShowClone(true)
  }

  async function create() {
    const name = store.name.trim()
    if (!name || store.busy) return

    const target = `${base()}/${name}`
    setStore("busy", true)
    try {
      await sdk
        .fetch(`${sdk.url}/global/mkdir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: target }),
        })
        .then((r) => {
          if (!r.ok) throw new Error(`mkdir failed: ${r.status}`)
          return r.json()
        })
      props.onSelect(props.multiple ? [target] : target)
      dialog.close()
    } catch {
      showToast({
        variant: "error",
        title: language.t("dialog.directory.create.error"),
      })
    } finally {
      setStore("busy", false)
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    create()
  }

  return (
    <Dialog title={language.t("dialog.directory.create")} class="w-full max-w-[400px] mx-auto min-h-fit!">
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <div class="flex items-center gap-2 text-12-regular text-text-weak">
          <Icon name="folder-add-left" size="small" class="shrink-0 text-icon-weak" />
          <span class="truncate">{base()}/</span>
        </div>

        <div class="flex flex-col gap-2">
          <Button type="button" variant="secondary" size="large" class="w-full" onClick={openCloneDialog}>
            <Icon name="github" size="small" class="mr-2" />
            Clone from GitHub
          </Button>
          <div class="flex items-center gap-2 text-12-regular text-text-weaker">
            <div class="flex-1 h-px bg-border-base" />
            <span>or create blank</span>
            <div class="flex-1 h-px bg-border-base" />
          </div>
          <TextField
            autofocus
            type="text"
            placeholder={language.t("dialog.directory.create.placeholder")}
            value={store.name}
            onChange={(v) => setStore("name", v)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault()
                create()
              }
            }}
          />
        </div>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={!store.name.trim() || store.busy}>
            {language.t("dialog.directory.create.action")}
          </Button>
        </div>
      </form>
      <Show when={showClone()}>
        <DialogCloneProject
          onSelect={(dir) => {
            setShowClone(false)
            props.onSelect(dir)
          }}
          onClose={() => setShowClone(false)}
        />
      </Show>
    </Dialog>
  )
}

function DialogCloneProject(props: { onSelect: (dir: string | null) => void; onClose: () => void }) {
  const dialog = useDialog()
  const [url, setUrl] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const language = useLanguage()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()

  const home = () => sync.data.path.home || ""
  const base = () => home() + "/.turtlecode"

  async function clone() {
    const repoUrl = url().trim()
    if (!repoUrl || busy()) return

    const name =
      repoUrl
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") || "repo"
    const target = `${base()}/${name}`
    setBusy(true)
    try {
      await sdk
        .fetch(`${sdk.url}/global/clone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: repoUrl, target }),
        })
        .then((r) => {
          if (!r.ok) throw new Error(`clone failed: ${r.status}`)
          return r.json()
        })
      props.onSelect(target)
      dialog.close()
    } catch {
      showToast({
        variant: "error",
        title: language.t("dialog.directory.create.error"),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Clone from GitHub" class="w-full max-w-[400px] mx-auto min-h-fit!">
      <div class="flex flex-col gap-4 p-6 pt-0">
        <div class="flex items-center gap-2 text-12-regular text-text-weak">
          <Icon name="folder-add-left" size="small" class="shrink-0 text-icon-weak" />
          <span class="truncate">{base()}/</span>
        </div>
        <TextField
          autofocus
          type="text"
          placeholder="https://github.com/user/repo"
          value={url()}
          onChange={setUrl}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault()
              clone()
            }
          }}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={props.onClose}>
            {language.t("common.cancel")}
          </Button>
          <Button type="button" variant="primary" size="large" disabled={!url().trim() || busy()} onClick={clone}>
            Clone
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
