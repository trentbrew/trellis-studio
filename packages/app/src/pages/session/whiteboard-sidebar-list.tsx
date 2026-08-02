import { For } from "solid-js"
import { PenLine, Pencil, Trash2 } from "lucide-solid"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { DialogRenameFile } from "@/components/dialog-rename-file"
import { WHITEBOARD_EXT, whiteboardTitle } from "@/lib/whiteboard/schema"

export function WhiteboardSidebarList(props: {
  paths: string[]
  active: string | null
  onSelect: (path: string) => void
  onDeleted: (path: string) => void
  onRenamed: (from: string, to: string) => void
}) {
  const file = useFile()
  const dialog = useDialog()
  const language = useLanguage()

  const rename = (path: string) => {
    dialog.show(() => (
      <DialogRenameFile
        path={path}
        kind="file"
        enforceExtension={WHITEBOARD_EXT}
        onRenamed={(to) => props.onRenamed(path, to)}
      />
    ))
  }

  const remove = async (path: string) => {
    const label = whiteboardTitle(path)
    const confirmed = confirm(`Delete "${label}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      await file.remove(path)
      props.onDeleted(path)
      showToast({ variant: "success", title: "Whiteboard deleted", description: label })
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to delete whiteboard",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <nav class="route-nav whiteboard-sidebar-list" aria-label="Whiteboards">
      <For each={props.paths}>
        {(path, idx) => (
          <div
            classList={{
              "whiteboard-sidebar-row route-motion-item": true,
              "whiteboard-sidebar-row--active": props.active === path,
              "fresh-overlay": file.isFresh(path),
            }}
            style={{ "animation-delay": `${idx() * 45}ms` }}
          >
            <button
              type="button"
              class="whiteboard-sidebar-row__select"
              aria-pressed={props.active === path}
              onClick={() => props.onSelect(path)}
            >
              <span class="route-nav-icon" aria-hidden>
                <PenLine class="size-4 text-icon-weak" />
              </span>
              <span class="route-nav-label">{whiteboardTitle(path)}</span>
            </button>
            <div
              class="whiteboard-sidebar-row__menu-wrap"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu gutter={4} placement="bottom-end">
                <DropdownMenu.Trigger
                  as={IconButton}
                  icon="dot-grid"
                  variant="ghost"
                  size="small"
                  class="whiteboard-sidebar-row__menu size-6 shrink-0"
                  aria-label={`Actions for ${whiteboardTitle(path)}`}
                />
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="min-w-40">
                  <DropdownMenu.Item onSelect={() => rename(path)}>
                    <Pencil class="size-3.5" />
                    <DropdownMenu.ItemLabel>{language.t("common.rename")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item class="text-text-destructive" onSelect={() => void remove(path)}>
                    <Trash2 class="size-3.5" />
                    <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          </div>
        )}
      </For>
    </nav>
  )
}
