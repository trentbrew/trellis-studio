import { Component, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useFocusOptional } from "@/context/focus"
import { isFocusStale } from "@/lib/focus/format"
import type { FocusContext } from "@/lib/focus/types"

const SURFACE_ICON: Partial<Record<FocusContext["surface"], string>> = {
  whiteboard: "brain",
  file: "prompt",
  cms: "checklist",
  graph: "brain",
  plan: "checklist",
  preview: "eye",
  design: "brain",
  assets: "brain",
  review: "fork",
  shell: "prompt",
  terminal: "terminal",
}

type FocusChipProps = {
  t: (key: string) => string
}

export const PromptFocusChip: Component<FocusChipProps> = (props) => {
  const focus = useFocusOptional()

  return (
    <Show when={focus?.active()}>
      {(current) => (
        <Tooltip
          class="w-full flex"
          value={
            <div class="max-w-[320px] text-12-regular whitespace-pre-wrap">
              {current().label}
              <Show when={current().summary}>
                {(summary) => (
                  <>
                    {"\n"}
                    {summary()}
                  </>
                )}
              </Show>
            </div>
          }
          placement="top"
          openDelay={600}
        >
          <div
            data-component="prompt-focus"
            classList={{
              "w-full h-7 shrink-0 flex items-center gap-1.5 px-2 border border-border/40 bg-surface-base cursor-default rounded-md": true,
              "opacity-60": !!focus?.excluded(),
            }}
          >
            <Icon name={SURFACE_ICON[current().surface] ?? "brain"} class="shrink-0 size-3.5 text-text-info-base" />
            <div class="flex items-center gap-1 min-w-0 flex-1 text-12-medium text-text-strong truncate">
              {current().label}
              <Show when={isFocusStale(current())}>
                <span
                  class="size-1.5 rounded-full bg-icon-warning-base shrink-0"
                  title={props.t("prompt.focus.stale")}
                />
              </Show>
            </div>
            {/* <IconButton
              type="button"
              icon="eye"
              variant="ghost"
              class="size-7 shrink-0 text-text-weak hover:text-text-strong"
              onClick={() => (focus?.pinned() ? focus.unpin() : focus?.pin())}
              aria-label={props.t(focus?.pinned() ? "prompt.focus.unpin" : "prompt.focus.pin")}
            />
            <IconButton
              type="button"
              icon="close-small"
              variant="ghost"
              class="size-7 shrink-0 text-text-weak hover:text-text-strong"
              onClick={() => focus?.toggleExcluded()}
              aria-label={props.t("prompt.focus.exclude")}
            /> */}
          </div>
        </Tooltip>
      )}
    </Show>
  )
}
