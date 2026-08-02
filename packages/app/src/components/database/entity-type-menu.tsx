import { Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { MoreHorizontal, Settings2, Pencil, Trash2 } from "lucide-solid"

export function EntityTypeMenu(props: {
  label: string
  onConfigure: () => void
  onRename?: () => void
  onDelete?: () => void
  class?: string
}) {
  return (
    <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
      <DropdownMenu.Trigger
        class={
          props.class ??
          "flex size-7 shrink-0 items-center justify-center rounded-md text-icon-weak hover:bg-surface-raised-base/30 hover:text-text-base"
        }
        aria-label={`Actions for ${props.label}`}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      >
        <MoreHorizontal class="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="min-w-[11rem]">
          <DropdownMenu.Item onSelect={() => props.onConfigure()}>
            <DropdownMenu.ItemLabel>
              <span class="flex items-center gap-2">
                <Settings2 class="size-3.5 shrink-0 opacity-70" />
                Configure
              </span>
            </DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <Show when={props.onRename}>
            <DropdownMenu.Item onSelect={() => props.onRename?.()}>
              <DropdownMenu.ItemLabel>
                <span class="flex items-center gap-2">
                  <Pencil class="size-3.5 shrink-0 opacity-70" />
                  Rename
                </span>
              </DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </Show>
          <Show when={props.onDelete}>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => props.onDelete?.()}>
            <DropdownMenu.ItemLabel>
              <span class="flex items-center gap-2 text-text-danger">
                <Trash2 class="size-3.5 shrink-0" />
                Delete type…
              </span>
            </DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
