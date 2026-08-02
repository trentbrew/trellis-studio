import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { showToast } from "@opencode-ai/ui/toast"
import { Popover as KobaltePopover } from "@kobalte/core/popover"
import { getFilename } from "@opencode-ai/util/path"
import { ChevronDown, Circle, LoaderCircle } from "lucide-solid"
import { batch, createMemo, createSignal, Show, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { PublishFirstPopover, type PublishSubmitInput } from "@/components/publish-first-popover"
import { createCloudAuth } from "@/context/cloud-auth"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { cloudProjectIdFromUrl } from "@/lib/brand-template-client"
import { isCloudMode } from "@/lib/cloud-mode"
import { runPublish } from "@/lib/publish-client"
import { slugifyPublishName } from "@/lib/publish-slug"
import { Persist, persisted } from "@/utils/persist"

export type ProjectPublishRecord = {
  url: string
  slug: string
  version?: string
}

type PublishRecords = Record<string, ProjectPublishRecord>

type PublishPhase = "never" | "publishing" | "live"

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  const el = document.createElement("textarea")
  el.value = text
  el.style.position = "fixed"
  el.style.opacity = "0"
  document.body.appendChild(el)
  el.select()
  document.execCommand("copy")
  document.body.removeChild(el)
  return Promise.resolve()
}

export function PreviewPublishControl(props: { visible: Accessor<boolean> }) {
  const sdk = useSDK()
  const language = useLanguage()
  const cloudAuth = createCloudAuth()

  const [records, setRecords] = persisted(
    Persist.global("project-publish", ["project-publish.v1"]),
    createStore<PublishRecords>({}),
  )

  const [publishing, setPublishing] = createSignal(false)
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  const [menuOpen, setMenuOpen] = createSignal(false)

  const scopeKey = createMemo(() => cloudProjectIdFromUrl() ?? sdk.directory)
  const record = createMemo(() => records[scopeKey()] ?? null)
  const phase = createMemo<PublishPhase>(() => {
    if (publishing()) return "publishing"
    if (record()?.url) return "live"
    return "never"
  })

  const active = createMemo(() => isCloudMode() && cloudAuth.active && props.visible())

  const defaultSlug = createMemo(() => slugifyPublishName(getFilename(sdk.directory) || "project"))

  const apiContext = () => {
    const token = cloudAuth.token()
    if (!token) throw new Error("Cloud auth required")
    return { fetch: sdk.fetch, url: sdk.url, directory: sdk.directory, authToken: token }
  }

  const openPublished = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const copyPublishedUrl = async (url: string) => {
    try {
      await copyText(url)
      showToast({
        title: language.t("publish.toast.copied.title"),
        description: language.t("publish.toast.copied.description"),
        variant: "success",
      })
    } catch {
      showToast({ title: language.t("publish.toast.copyFailed.title"), variant: "default" })
    }
  }

  const saveRecord = (next: ProjectPublishRecord) => {
    setRecords(scopeKey(), next)
  }

  const runPublishFlow = async (slug: string, overrides?: Omit<PublishSubmitInput, "slug">) => {
    setPublishing(true)
    try {
      const ctx = apiContext()
      const result = await runPublish(ctx, {
        slug,
        visibility: overrides?.visibility ?? "public",
        buildCommand: overrides?.buildCommand,
        outputDir: overrides?.outputDir,
        spaFallback: overrides?.spaFallback,
      })
      if (!result.ok) {
        showToast({
          title: language.t("publish.toast.failed.title"),
          description: result.error.message ?? result.error.error,
        })
        return
      }
      saveRecord({ url: result.url, slug, version: result.version })
      setPopoverOpen(false)
      showToast({
        title: language.t("publish.toast.success.title"),
        description: result.url,
        variant: "success",
      })
    } catch (e) {
      showToast({
        title: language.t("publish.toast.failed.title"),
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setPublishing(false)
    }
  }

  const onFirstPublish = (input: PublishSubmitInput) => runPublishFlow(input.slug, input)

  return (
    <Show when={active()}>
      <div class="preview-publish-control">
        <Show
          when={phase() === "live" ? record() : undefined}
          fallback={
            <Show
              when={phase() === "publishing"}
              fallback={
                <KobaltePopover
                  open={popoverOpen()}
                  placement="bottom-end"
                  gutter={6}
                  modal={false}
                  onOpenChange={setPopoverOpen}
                >
                  <KobaltePopover.Trigger
                    as="button"
                    type="button"
                    class="preview-publish-btn preview-publish-btn--primary"
                    aria-label={language.t("publish.action.publish")}
                  >
                    <Circle class="preview-publish-dot preview-publish-dot--idle" />
                    <span>{language.t("publish.action.publish")}</span>
                  </KobaltePopover.Trigger>
                  <KobaltePopover.Portal>
                    <KobaltePopover.Content data-component="popover-content" class="preview-publish-popover">
                      <Show when={popoverOpen()}>
                        <PublishFirstPopover
                          defaultSlug={defaultSlug()}
                          publishing={publishing()}
                          getApiContext={apiContext}
                          onSubmit={onFirstPublish}
                        />
                      </Show>
                    </KobaltePopover.Content>
                  </KobaltePopover.Portal>
                </KobaltePopover>
              }
            >
              <button type="button" class="preview-publish-btn" disabled aria-busy="true">
                <LoaderCircle class="preview-publish-spinner" />
                <span>{language.t("publish.action.publishing")}</span>
              </button>
            </Show>
          }
        >
          {(live) => (
            <div class="preview-publish-split">
              <button
                type="button"
                class="preview-publish-btn preview-publish-btn--live"
                onClick={() => openPublished(live().url)}
                title={language.t("publish.action.view")}
              >
                <span class="preview-publish-dot preview-publish-dot--live" />
                <span>{language.t("publish.action.live")}</span>
              </button>
              <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
                <DropdownMenu.Trigger
                  as="button"
                  type="button"
                  class="preview-publish-menu-trigger"
                  aria-label={language.t("publish.menu.aria")}
                >
                  <ChevronDown class="size-3.5" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item
                      onSelect={() => {
                        openPublished(live().url)
                      }}
                    >
                      <DropdownMenu.ItemLabel>{language.t("publish.menu.view")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => {
                        void copyPublishedUrl(live().url)
                      }}
                    >
                      <DropdownMenu.ItemLabel>{language.t("publish.menu.copyUrl")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      onSelect={() => {
                        void runPublishFlow(live().slug)
                      }}
                    >
                      <DropdownMenu.ItemLabel>{language.t("publish.menu.republish")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item disabled>
                      <DropdownMenu.ItemLabel>{language.t("publish.menu.versions")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}
