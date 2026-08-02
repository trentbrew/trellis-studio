import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { OPENAI_PROVIDER_ID } from "@/lib/codex-model"
import { useProviders } from "@/hooks/use-providers"

export function SessionConnectOpenaiBanner() {
  const dialog = useDialog()
  const language = useLanguage()
  const providers = useProviders()
  const server = useServer()

  const show = createMemo(() => {
    const connected = new Set(providers.connected().map((item) => item.id))
    return !connected.has(OPENAI_PROVIDER_ID)
  })

  function connect() {
    void import("@/components/dialog-connect-provider").then((x) => {
      dialog.show(() => <x.DialogConnectProvider provider={OPENAI_PROVIDER_ID} />)
    })
  }

  return (
    <Show when={show()}>
      <div class="pb-2">
        <div class="flex flex-col gap-3 rounded-md border border-border-weak-base bg-background-base px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <ProviderIcon id={OPENAI_PROVIDER_ID} class="mt-0.5 size-5 shrink-0 icon-strong-base" />
            <div class="flex flex-col gap-1">
              <div class="text-14-medium text-text-strong">{language.t("session.connectOpenai.title")}</div>
              <div class="text-14-regular text-text-weak">
                {server.isLocal()
                  ? language.t("session.connectOpenai.description.local")
                  : language.t("session.connectOpenai.description.remote")}
              </div>
            </div>
          </div>
          <Button class="w-full sm:w-auto shrink-0" variant="secondary" size="small" onClick={connect}>
            {language.t("session.connectOpenai.action")}
          </Button>
        </div>
      </div>
    </Show>
  )
}
