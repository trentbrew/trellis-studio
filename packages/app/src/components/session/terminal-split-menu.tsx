import { Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useTerminal } from "@/context/terminal"

export function TerminalSplitMenu() {
  const terminal = useTerminal()
  const layout = useLayout()
  const language = useLanguage()
  const command = useCommand()

  const active = () => terminal.focusedPane() ?? terminal.active()

  const split = (direction: "h" | "v") => {
    const id = active()
    if (!id) return
    layout.terminal.open()
    void terminal.split(id, direction)
  }

  const closePane = () => {
    const id = active()
    if (!id) return
    terminal.unsplit(id)
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        as={IconButton}
        icon="terminal-split"
        variant="ghost"
        class="shrink-0"
        aria-label={language.t("command.terminal.split.menu")}
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="mt-1 min-w-48">
          <DropdownMenu.Item onSelect={() => split("h")}>
            <Icon name="square-split-horizontal" class="w-4 h-4 mr-2 shrink-0" />
            <DropdownMenu.ItemLabel>{language.t("command.terminal.split.horizontal")}</DropdownMenu.ItemLabel>
            <span class="ml-auto pl-3 text-12-regular text-text-weak">{command.keybind("terminal.split.horizontal")}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => split("v")}>
            <Icon name="square-split-vertical" class="w-4 h-4 mr-2 shrink-0" />
            <DropdownMenu.ItemLabel>{language.t("command.terminal.split.vertical")}</DropdownMenu.ItemLabel>
            <span class="ml-auto pl-3 text-12-regular text-text-weak">{command.keybind("terminal.split.vertical")}</span>
          </DropdownMenu.Item>
          <Show when={terminal.paneTree()}>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={closePane}>
              <Icon name="close-small" class="w-4 h-4 mr-2 shrink-0" />
              <DropdownMenu.ItemLabel>{language.t("command.terminal.pane.close")}</DropdownMenu.ItemLabel>
              <span class="ml-auto pl-3 text-12-regular text-text-weak">{command.keybind("terminal.pane.close")}</span>
            </DropdownMenu.Item>
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
