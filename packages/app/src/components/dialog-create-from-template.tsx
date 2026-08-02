import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

type ProjectTemplateInfo = {
  id: string
  name: string
  description: string
  kind: string
  icon?: string
  tags: string[]
}

interface DialogCreateFromTemplateProps {
  onSelect: (result: string | null) => void
}

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  )
}

function defaultName(template: ProjectTemplateInfo) {
  if (template.kind === "video") return "Untitled Video"
  if (template.kind === "mobile") return "Untitled App"
  if (template.kind === "web") return "Untitled Site"
  if (template.kind === "game") return "Untitled Game"
  if (template.kind === "docs") return "Untitled Docs"
  return "Untitled Project"
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  return response.json().catch(() => undefined)
}

export function DialogCreateFromTemplate(props: DialogCreateFromTemplateProps) {
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const language = useLanguage()

  const [store, setStore] = createStore({
    busy: false,
    error: "",
    name: "",
    selectedId: "",
  })

  const [templates] = createResource(async () => {
    const response = await sdk.fetch(`${sdk.url}/global/templates`)
    if (!response.ok) throw new Error(language.t("dialog.template.loadError"))
    return ((await response.json()) as ProjectTemplateInfo[]).filter((template) => template.id && template.name)
  })

  const home = () => sync.data.path.home || ""
  const base = () => (home() ? home() + "/.turtlecode" : "~/.turtlecode")
  const selected = createMemo(() => templates()?.find((template) => template.id === store.selectedId))
  const targetPreview = createMemo(() => `${base()}/${slugify(store.name.trim() || selected()?.name || "project")}`)

  createEffect(() => {
    const first = templates()?.[0]
    if (!first) return
    if (!store.selectedId) setStore("selectedId", first.id)
    if (!store.name) setStore("name", defaultName(first))
  })

  async function create() {
    const template = selected()
    const name = store.name.trim()
    if (!template || !name || store.busy) return

    setStore("busy", true)
    setStore("error", "")
    try {
      const response = await sdk.fetch(`${sdk.url}/global/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id, name }),
      })
      const body = await safeJson<{ path?: string; error?: string }>(response)
      if (!response.ok || !body?.path) {
        const message = body?.error || language.t("dialog.template.createError")
        setStore("error", message)
        showToast({ variant: "error", title: message })
        return
      }
      props.onSelect(body.path)
      dialog.close()
    } catch {
      const message = language.t("dialog.template.createError")
      setStore("error", message)
      showToast({ variant: "error", title: message })
    } finally {
      setStore("busy", false)
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    create()
  }

  return (
    <Dialog title={language.t("dialog.template.title")} class="w-full max-w-[560px] mx-auto min-h-fit!">
      <form onSubmit={submit} class="flex flex-col gap-4 p-6 pt-0">
        <Show
          when={!templates.loading}
          fallback={
            <div class="flex items-center gap-2 text-13-regular text-text-weak">
              <Icon name="loader-circle" size="small" class="shrink-0 animate-spin" />
              <span>{language.t("common.loading")}</span>
            </div>
          }
        >
          <div class="grid max-h-[48vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            <For each={templates() ?? []}>
              {(template) => (
                <button
                  type="button"
                  class="rounded-8 border p-3 text-left transition-colors"
                  classList={{
                    "border-border-strong-base bg-surface-raised": store.selectedId === template.id,
                    "border-border-weak-base hover:border-border-base": store.selectedId !== template.id,
                  }}
                  onClick={() => {
                    setStore("selectedId", template.id)
                    if (!store.name || store.name.startsWith("Untitled ")) setStore("name", defaultName(template))
                  }}
                >
                  <div class="flex items-start gap-3">
                    <Icon name={template.icon || "layout-template"} size="medium" class="mt-0.5 text-icon-base" />
                    <div class="min-w-0 flex-1">
                      <div class="text-14-medium text-text-base truncate">{template.name}</div>
                      <div class="mt-1 text-12-regular text-text-weak leading-5">{template.description}</div>
                      <div class="mt-3 flex flex-wrap gap-1">
                        <For each={template.tags}>
                          {(tag) => (
                            <span class="rounded-4 border border-border-weak-base px-1.5 py-0.5 text-11-regular text-text-weak">
                              {tag}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="flex flex-col gap-2">
          <TextField
            autofocus
            type="text"
            placeholder={language.t("dialog.directory.create.placeholder")}
            value={store.name}
            onChange={(value) => setStore("name", value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault()
                create()
              }
            }}
          />
          <div class="flex items-center gap-2 text-12-regular text-text-weak">
            <Icon name="folder-add-left" size="small" class="shrink-0 text-icon-weak" />
            <span class="truncate">{targetPreview()}</span>
          </div>
        </div>

        <Show when={templates.error}>
          <p class="text-12-regular text-red-500">{language.t("dialog.template.loadError")}</p>
        </Show>
        <Show when={store.error}>
          <p class="text-12-regular text-red-500">{store.error}</p>
        </Show>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="large"
            disabled={!store.name.trim() || !selected() || store.busy}
          >
            {store.busy ? language.t("common.loading") : language.t("dialog.template.action")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
