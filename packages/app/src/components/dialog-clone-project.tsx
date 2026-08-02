import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"

interface DialogCloneProjectProps {
  onSelect: (result: string | null) => void
}

export function DialogCloneProject(props: DialogCloneProjectProps) {
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const language = useLanguage()

  const [store, setStore] = createStore({
    url: "",
    busy: false,
    error: "",
  })

  async function clone() {
    const url = store.url.trim()
    if (!url || store.busy) return

    setStore("busy", true)
    setStore("error", "")
    try {
      const res = await sdk.fetch(`${sdk.url}/global/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStore("error", (data as { error?: string }).error || language.t("dialog.clone.error"))
        return
      }
      props.onSelect((data as { path: string }).path)
      dialog.close()
    } catch {
      setStore("error", language.t("dialog.clone.error"))
    } finally {
      setStore("busy", false)
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    clone()
  }

  return (
    <Dialog title={language.t("dialog.clone.title")} class="w-full max-w-[440px] mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <div class="flex items-center gap-2 text-12-regular text-text-weak">
          <Icon name="branch" size="small" class="shrink-0 text-icon-weak" />
          <span>{language.t("dialog.clone.description")}</span>
        </div>
        <TextField
          autofocus
          type="url"
          placeholder="https://github.com/owner/repo"
          value={store.url}
          onChange={(v) => setStore("url", v)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault()
              clone()
            }
          }}
        />
        {store.error && <p class="text-12-regular text-red-500">{store.error}</p>}
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={!store.url.trim() || store.busy}>
            {store.busy ? language.t("common.loading") : language.t("dialog.clone.action")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
