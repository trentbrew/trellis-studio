import { Component, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useDragDrop } from "@/context/drag-drop"
import { useLanguage } from "@/context/language"

const kindToIcon = {
  image: "photo",
  "@mention": "link",
} as const

export const AppDragOverlay: Component = () => {
  const dragDrop = useDragDrop()
  const language = useLanguage()

  const draggingType = () => dragDrop.draggingType()
  const iconName = () => (draggingType() ? kindToIcon[draggingType()! as keyof typeof kindToIcon] : kindToIcon.image)

  return (
    <Show when={draggingType() !== null}>
      <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-raised-stronger-non-alpha/90 pointer-events-none">
        <div class="flex flex-col items-center gap-2 text-text-weak">
          <Icon name={iconName()} class="size-8" />
          <span class="text-14-regular">
            {language.t(draggingType() === "@mention" ? "prompt.dropzone.file.label" : "prompt.dropzone.label")}
          </span>
        </div>
      </div>
    </Show>
  )
}
