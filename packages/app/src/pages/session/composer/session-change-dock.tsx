import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { DockTray } from "@opencode-ai/ui/dock-surface"
import { DiffChanges } from "@opencode-ai/ui/diff-changes"
import type { FileDiff } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"

export function SessionChangeDock(props: {
  files: FileDiff[]
  rejecting?: boolean
  onAccept: () => void
  onReject: () => void
  onReview?: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ collapsed: true })

  const count = createMemo(() => props.files.length)
  const label = createMemo(() =>
    language.t(count() === 1 ? "session.changeDock.title.one" : "session.changeDock.title.other", {
      count: count(),
    }),
  )

  const toggle = () => setStore("collapsed", (v) => !v)
  const handleTitleClick = () => {
    if (props.onReview) {
      props.onReview()
    } else {
      toggle()
    }
  }

  return (
    <DockTray data-component="session-change-dock">
      <div
        class="pl-3 pr-2 py-2 flex items-center gap-2"
        role="button"
        tabIndex={0}
        onClick={handleTitleClick}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          handleTitleClick()
        }}
      >
        <IconButton
          icon="chevron-down"
          size="normal"
          variant="ghost"
          style={{ transform: `rotate(${store.collapsed ? 180 : 0}deg)` }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={
            store.collapsed ? language.t("session.changeDock.expand") : language.t("session.changeDock.collapse")
          }
        />
        <span class="flex-1 min-w-0 text-14-regular text-text-strong cursor-default">{label()}</span>
        <div
          class="flex items-center gap-1 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="normal" onClick={props.onReject} disabled={props.rejecting}>
            {language.t("session.changeDock.reject")}
          </Button>
          <Button variant="primary" size="normal" onClick={props.onAccept} disabled={props.rejecting}>
            {language.t("session.changeDock.accept")}
          </Button>
        </div>
      </div>

      <Show when={!store.collapsed}>
        <div class="px-3 pb-3 flex flex-col gap-1 max-h-40 overflow-y-auto no-scrollbar">
          <For each={props.files}>
            {(diff) => (
              <div class="flex items-center gap-2 py-0.5 min-w-0">
                <span
                  class="text-10-medium font-mono w-3 shrink-0 text-center"
                  classList={{
                    "text-[var(--icon-diff-add-base)]": diff.status === "added",
                    "text-[var(--icon-diff-delete-base)]": diff.status === "deleted",
                    "text-text-weak": diff.status === "modified" || !diff.status,
                  }}
                >
                  {diff.status === "added" ? "A" : diff.status === "deleted" ? "D" : "M"}
                </span>
                <span class="flex-1 min-w-0 truncate text-13-regular text-text-base">{diff.file}</span>
                <DiffChanges
                  class="shrink-0 text-12-regular"
                  changes={{ additions: diff.additions, deletions: diff.deletions }}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
    </DockTray>
  )
}
