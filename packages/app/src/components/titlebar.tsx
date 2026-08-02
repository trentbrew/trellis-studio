import { createEffect, createMemo, For, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import { decode64 } from "@/utils/base64"

import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { applyPath, backPath, forwardPath } from "./titlebar-history"
import { exitToCloud, isCloudMode } from "@/lib/cloud-mode"

type TauriDesktopWindow = {
  startDragging?: () => Promise<void>
  toggleMaximize?: () => Promise<void>
}

type TauriThemeWindow = {
  setTheme?: (theme?: "light" | "dark" | null) => Promise<void>
}

type TauriApi = {
  window?: {
    getCurrentWindow?: () => TauriDesktopWindow
  }
  webviewWindow?: {
    getCurrentWebviewWindow?: () => TauriThemeWindow
  }
}

const tauriApi = () => (window as unknown as { __TAURI__?: TauriApi }).__TAURI__
const currentDesktopWindow = () => tauriApi()?.window?.getCurrentWindow?.()
const currentThemeWindow = () => tauriApi()?.webviewWindow?.getCurrentWebviewWindow?.()

export function Titlebar() {
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const language = useLanguage()
  const theme = useTheme()
  const dialog = useDialog()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()

  function openNewProject() {
    void import("./dialog-create-project").then(({ DialogCreateProject }) => {
      dialog.show(() => (
        <DialogCreateProject
          onSelect={(result) => {
            if (!result) return
            const dir = Array.isArray(result) ? result[0] : result
            if (dir) {
              layout.projects.open(dir)
              navigate(`/${base64Encode(dir)}/session`)
            }
          }}
        />
      ))
    })
  }

  function openCloneProject() {
    void import("./dialog-clone-project").then(({ DialogCloneProject }) => {
      dialog.show(() => (
        <DialogCloneProject
          onSelect={(dir) => {
            if (!dir) return
            layout.projects.open(dir)
            navigate(`/${base64Encode(dir)}/session`)
          }}
        />
      ))
    })
  }

  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos")
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")
  const zoom = () => platform.webviewZoom?.() ?? 1
  const minHeight = () => (mac() ? `${40 / zoom()}px` : undefined)

  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: 0,
    action: undefined as "back" | "forward" | undefined,
  })

  const path = () => `${location.pathname}${location.search}${location.hash}`
  createEffect(() => {
    const current = path()

    untrack(() => {
      const next = applyPath(history, current)
      if (next === history) return
      setHistory(next)
    })
  })

  const hasProjects = createMemo(() => layout.projects.list().length > 0)
  const dir = createMemo(() => decode64(params.dir ?? ""))
  const currentProject = createMemo(() => {
    const d = dir()
    if (!d) return
    return layout.projects.list().find((p) => p.worktree === d || p.sandboxes?.includes(d))
  })
  const currentProjectLabel = createMemo(() => {
    const p = currentProject()
    if (p) return p.name || getFilename(p.worktree)
    const d = dir()
    if (d) return getFilename(d)
    return language.t("command.project.open")
  })
  const currentProjectTooltip = createMemo(() => {
    const p = currentProject()
    if (p) return p.worktree
    const d = dir()
    if (d) return d
    return language.t("command.project.open")
  })

  const back = () => {
    const next = backPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  const forward = () => {
    const next = forwardPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  command.register(() => [
    {
      id: "common.goBack",
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      keybind: "mod+[",
      onSelect: back,
    },
    {
      id: "common.goForward",
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      keybind: "mod+]",
      onSelect: forward,
    },
  ])

  const getWin = () => {
    if (platform.platform !== "desktop") return
    return currentDesktopWindow()
  }

  createEffect(() => {
    if (platform.platform !== "desktop") return

    const scheme = theme.colorScheme()
    const value = scheme === "system" ? null : scheme

    const win = currentThemeWindow()
    if (!win?.setTheme) return

    void win.setTheme(value).catch(() => undefined)
  })

  const interactive = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false

    const selector =
      "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']"

    return !!target.closest(selector)
  }

  const drag = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (e.buttons !== 1) return
    if (interactive(e.target)) return

    const win = getWin()
    if (!win?.startDragging) return

    e.preventDefault()
    void win.startDragging().catch(() => undefined)
  }

  const maximize = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (interactive(e.target)) return
    if (e.target instanceof Element && e.target.closest("[data-tauri-decorum-tb]")) return

    const win = getWin()
    if (!win?.toggleMaximize) return

    e.preventDefault()
    void win.toggleMaximize().catch(() => undefined)
  }

  return (
    <header
      class="h-12 shrink-0 bg-transparent relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
      style={{ "min-height": minHeight() }}
      data-tauri-drag-region
      onMouseDown={drag}
      onDblClick={maximize}
    >
      <div
        classList={{
          "flex items-center min-w-0": true,
          "pl-2": !mac(),
        }}
      >
        <Show when={mac()}>
          <div class="h-full shrink-0" style={{ width: `${72 / zoom()}px` }} />
          <div class="hidden w-8 shrink-0 items-center justify-center lg:flex sm:w-10 xl:hidden">
            <IconButton
              icon="menu"
              variant="ghost"
              class="titlebar-icon rounded-md"
              onClick={layout.mobileSidebar.toggle}
              aria-label={language.t("sidebar.menu.toggle")}
              aria-expanded={layout.mobileSidebar.opened()}
            />
          </div>
        </Show>
        <Show when={!mac()}>
          <div class="hidden w-8 shrink-0 items-center justify-center sm:mr-2 lg:flex xl:hidden">
            <IconButton
              icon="menu"
              variant="ghost"
              class="titlebar-icon rounded-md"
              onClick={layout.mobileSidebar.toggle}
              aria-label={language.t("sidebar.menu.toggle")}
              aria-expanded={layout.mobileSidebar.opened()}
            />
          </div>
        </Show>
        <div class="flex items-center gap-1 min-w-0 ml-1 px-1 sm:gap-2 sm:ml-2 sm:px-2">
          <Show when={!isCloudMode()}>
            <Show when={hasProjects() || true}>
              <div class="flex items-center shrink-0">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 800 800"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  class="shrink-0"
                >
                  <path
                    d="M373.362 226.643C388.087 211.919 411.96 211.919 426.684 226.643L573.37 373.324C588.094 388.047 588.094 411.92 573.37 426.644L426.684 573.324C411.96 588.048 388.087 588.048 373.362 573.324L226.677 426.644C211.952 411.92 211.952 388.047 226.677 373.324L373.362 226.643Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M586.658 513.282C594.02 505.921 605.956 505.921 613.318 513.282L686.659 586.621C694.021 593.983 694.021 605.919 686.659 613.28L613.318 686.619C605.956 693.981 594.02 693.981 586.658 686.619L513.317 613.28C505.955 605.919 505.955 593.983 513.317 586.621L586.658 513.282Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M286.501 586.454C293.957 593.909 293.957 605.997 286.501 613.453L213.5 686.452C206.044 693.907 193.956 693.907 186.5 686.452L113.499 613.453C106.043 605.997 106.043 593.909 113.499 586.454L186.5 513.455C193.956 506 206.044 506 213.5 513.455L286.501 586.454Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M406.524 93.4982C402.934 97.088 397.113 97.088 393.523 93.4982L356.523 56.499C352.933 52.9092 352.933 47.089 356.523 43.4992L393.523 6.50002C397.113 2.91025 402.934 2.91025 406.524 6.50003L443.524 43.4992C447.114 47.089 447.114 52.9092 443.524 56.499L406.524 93.4982Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M186.502 113.498C193.958 106.042 206.046 106.042 213.502 113.498L286.503 186.496C293.959 193.952 293.959 206.04 286.503 213.496L213.502 286.494C206.046 293.95 193.958 293.95 186.502 286.494L113.501 213.496C106.045 206.04 106.045 193.952 113.501 186.496L186.502 113.498Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M686.499 186.483C693.955 193.939 693.955 206.027 686.499 213.482L613.498 286.481C606.042 293.937 593.954 293.937 586.498 286.481L513.497 213.482C506.041 206.027 506.041 193.939 513.497 186.483L586.498 113.484C593.954 106.029 606.042 106.029 613.498 113.484L686.499 186.483Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                  <path
                    d="M356.689 756.666C353.007 752.985 353.007 747.017 356.689 743.336L393.359 706.667C397.04 702.986 403.008 702.986 406.689 706.667L443.359 743.336C447.041 747.017 447.041 752.985 443.359 756.666L406.689 793.335C403.008 797.016 397.04 797.016 393.359 793.335L356.689 756.666Z"
                    fill="currentColor"
                    class="text-text-base"
                  />
                </svg>
              </div>
              <DropdownMenu placement="bottom" gutter={4} modal={false}>
                <DropdownMenu.Trigger
                  as={Button}
                  variant="ghost"
                  size="small"
                  class="flex h-7 min-w-0 max-w-[128px] items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] text-text-base hover:bg-white/5 sm:max-w-[280px] sm:px-2 lg:max-w-[360px] xl:max-w-[520px]"
                  title={currentProjectTooltip()}
                >
                  <Icon
                    name="folder-add-left"
                    size="small"
                    class="shrink-0 text-text-weak"
                    style={{ "font-size": "12px" }}
                  />
                  <span class="truncate opacity-70">{currentProjectLabel()}</span>
                  <Icon name="chevron-down" size="small" class="shrink-0 text-icon-weak" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="min-w-[180px]">
                    <Show when={!isCloudMode()}>
                      <For each={layout.projects.list()}>
                        {(project) => (
                          <DropdownMenu.Item onSelect={() => navigate(`/${base64Encode(project.worktree)}/session`)}>
                            <DropdownMenu.ItemLabel>
                              {project.name || getFilename(project.worktree)}
                            </DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                        )}
                      </For>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item onSelect={() => command.trigger("project.open")}>
                        <DropdownMenu.ItemLabel>{language.t("command.project.open")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger>{language.t("command.project.new")}</DropdownMenu.SubTrigger>
                        <DropdownMenu.SubContent>
                          <DropdownMenu.Item onSelect={openNewProject}>
                            <DropdownMenu.ItemLabel>{language.t("command.project.newBlank")}</DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={openCloneProject}>
                            <DropdownMenu.ItemLabel>
                              {language.t("command.project.importGitHub")}
                            </DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Sub>
                    </Show>
                    <Show when={isCloudMode()}>
                      <DropdownMenu.Item onSelect={exitToCloud}>
                        <DropdownMenu.ItemLabel>Exit to Trellis Cloud</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </Show>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </Show>
          </Show>
        </div>
        <div id="opencode-titlebar-left" class="flex items-center gap-1 sm:gap-2" />
      </div>

      <div class="min-w-0 flex items-center justify-center pointer-events-none">
        <div class="pointer-events-auto min-w-0 flex items-center justify-center w-fit max-w-full">
          <div id="opencode-titlebar-center" class="min-w-0 flex justify-center" />
        </div>
      </div>

      <div
        classList={{
          "flex items-center min-w-0 justify-end": true,
          "pr-2": !windows(),
        }}
        data-tauri-drag-region
        onMouseDown={drag}
      >
        <div id="opencode-titlebar-right" class="flex items-center gap-1 sm:gap-2" />
        <div class="flex items-center gap-3 sm:gap-3">
          <TooltipKeybind
            placement="bottom"
            title={language.t("sidebar.settings")}
            keybind={command.keybind("settings.open") ?? ""}
          >
            <Button
              variant="ghost"
              class="titlebar-icon w-8 h-6 p-0 box-border shrink-0"
              onClick={() => command.trigger("settings.open")}
              aria-label={language.t("sidebar.settings")}
            >
              <Icon size="small" name="settings-gear" />
            </Button>
          </TooltipKeybind>
        </div>
        <Show when={windows()}>
          {!tauriApi() && <div class="w-36 shrink-0" />}
          <div data-tauri-decorum-tb class="flex flex-row" />
        </Show>
      </div>
    </header>
  )
}
