import { Component } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"
import { SettingsServices } from "./settings-services"

export const DialogSettings: Component<{ tab?: "general" | "shortcuts" | "providers" | "models" | "services" }> = (
  props,
) => {
  const language = useLanguage()
  const platform = usePlatform()
  const mobile = createMediaQuery("(max-width: 639px)")

  return (
    <Dialog
      size="x-large"
      transition
      class="!h-[calc(100dvh-2rem)] !w-[calc(100vw-2rem)] [&_[data-slot=dialog-body]]:min-h-0 sm:!h-[min(720px,calc(100dvh-2rem))] sm:!w-[min(960px,calc(100vw-2rem))]"
    >
      <Tabs
        orientation={mobile() ? "horizontal" : "vertical"}
        variant="settings"
        defaultValue={props.tab ?? "general"}
        class="h-full min-h-0 settings-dialog"
      >
        <Tabs.List class="shrink-0 overflow-x-auto no-scrollbar sm:overflow-visible">
          <div class="flex h-full w-full shrink-0 justify-between gap-2 sm:flex-col">
            <div class="flex w-full shrink-0 gap-2 py-2 sm:flex-col sm:gap-3 sm:pt-3">
              <div class="flex shrink-0 gap-2 sm:flex-col sm:gap-3">
                <div class="flex shrink-0 gap-1.5 sm:flex-col">
                  <div class="hidden sm:block">
                    <Tabs.SectionTitle>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
                  </div>
                  <div class="flex shrink-0 gap-1.5 sm:w-full sm:flex-col">
                    <Tabs.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </Tabs.Trigger>
                  </div>
                </div>

                <div class="flex shrink-0 gap-1.5 sm:flex-col">
                  <div class="hidden sm:block">
                    <Tabs.SectionTitle>{language.t("settings.section.server")}</Tabs.SectionTitle>
                  </div>
                  <div class="flex shrink-0 gap-1.5 sm:w-full sm:flex-col">
                    <Tabs.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="services">
                      <Icon name="terminal" />
                      Services
                    </Tabs.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="hidden flex-col gap-1 pl-1 py-1 text-12-medium text-text-weak sm:flex">
              <span>{language.t("app.name.desktop")}</span>
              <span class="text-11-regular">v{platform.version}</span>
            </div>
          </div>
        </Tabs.List>
        <Tabs.Content value="general" class="min-h-0 no-scrollbar">
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="min-h-0 no-scrollbar">
          <SettingsKeybinds />
        </Tabs.Content>
        <Tabs.Content value="providers" class="min-h-0 no-scrollbar">
          <SettingsProviders />
        </Tabs.Content>
        <Tabs.Content value="models" class="min-h-0 no-scrollbar">
          <SettingsModels />
        </Tabs.Content>
        <Tabs.Content value="services" class="min-h-0 no-scrollbar">
          <SettingsServices />
        </Tabs.Content>
      </Tabs>
    </Dialog>
  )
}
