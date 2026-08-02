import { Component, For, Match, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

export type AtOption =
  | { type: "agent"; name: string; display: string }
  | { type: "file"; path: string; display: string; recent?: boolean }
  | { type: "entity"; entityType: string; entityId: string; display: string }

export type HashOption =
  | { type: "entity"; name: string; entityType: string; display: string }
  | { type: "symbol"; name: string; symbolType: string; display: string }

export type WikiOption = {
  namespace: string
  target: string
  display: string
}

export interface SlashCommand {
  id: string
  trigger: string
  title: string
  description?: string
  keybind?: string
  type: "builtin" | "custom"
  source?: "command" | "mcp" | "skill"
}

type PromptPopoverProps = {
  popover: "at" | "slash" | "hash" | "wiki" | null
  setSlashPopoverRef: (el: HTMLDivElement) => void
  atFlat: AtOption[]
  atGrouped: Array<{ category: string; items: AtOption[] }>
  atActive?: string
  atKey: (item: AtOption) => string
  setAtActive: (id: string) => void
  onAtSelect: (item: AtOption) => void
  slashFlat: SlashCommand[]
  slashActive?: string
  setSlashActive: (id: string) => void
  onSlashSelect: (item: SlashCommand) => void
  hashFlat: HashOption[]
  hashActive?: string
  setHashActive: (id: string) => void
  onHashSelect: (item: HashOption) => void
  wikiFlat: WikiOption[]
  wikiActive?: string
  setWikiActive: (id: string) => void
  onWikiSelect: (item: WikiOption) => void
  commandKeybind: (id: string) => string | undefined
  t: (key: string) => string
}

export const PromptPopover: Component<PromptPopoverProps> = (props) => {
  return (
    <Show when={props.popover}>
      <div
        ref={(el) => {
          if (props.popover === "slash") props.setSlashPopoverRef(el)
        }}
        class="absolute inset-x-0 -top-2 -translate-y-full origin-bottom-left max-h-80 min-h-10
                 overflow-auto no-scrollbar flex flex-col p-2 rounded-[12px]
                 bg-surface-raised-stronger-non-alpha shadow-[var(--shadow-lg-border-base)]"
        onMouseDown={(e) => e.preventDefault()}
      >
        <Switch>
          <Match when={props.popover === "at"}>
            <Show
              when={props.atFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyResults")}</div>}
            >
              <For each={props.atGrouped}>
                {(group) => (
                  <>
                    <Show when={group.category}>
                      <div class="text-11-medium uppercase tracking-wide text-text-weak px-2 py-1">
                        {group.category === "agent" && "Agents"}
                        {group.category === "entity" && "Entities"}
                        {group.category === "recent" && "Recent"}
                        {group.category === "file" && "Files"}
                      </div>
                    </Show>
                    <For each={group.items.slice(0, 10)}>
                      {(item) => {
                        const key = props.atKey(item)

                        if (item.type === "agent") {
                          return (
                            <button
                              class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                              classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                              onClick={() => props.onAtSelect(item)}
                              onMouseEnter={() => props.setAtActive(key)}
                            >
                              <Icon name="brain" size="small" class="text-icon-info-active shrink-0" />
                              <span class="text-14-regular text-text-strong whitespace-nowrap">@{item.name}</span>
                            </button>
                          )
                        }

                        if (item.type === "entity") {
                          const icon = () => {
                            switch (item.entityType) {
                              case "issue":
                                return "checklist"
                              case "milestone":
                                return "trophy"
                              case "decision":
                                return "brain"
                              case "symbol":
                                return "code"
                              default:
                                return "archive"
                            }
                          }

                          return (
                            <button
                              class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                              classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                              onClick={() => props.onAtSelect(item)}
                              onMouseEnter={() => props.setAtActive(key)}
                            >
                              <Icon name={icon()} size="small" class="text-icon-info-active shrink-0" />
                              <div class="flex flex-col items-start min-w-0">
                                <span class="text-14-regular text-text-strong whitespace-nowrap truncate">
                                  @{item.display}
                                </span>
                                <span class="text-12-regular text-text-weak truncate font-mono">{item.entityId}</span>
                              </div>
                              <span class="ml-auto shrink-0 text-10-medium text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                                {item.entityType}
                              </span>
                            </button>
                          )
                        }

                        const isDirectory = item.path.endsWith("/")
                        const directory = isDirectory ? item.path : getDirectory(item.path)
                        const filename = isDirectory ? "" : getFilename(item.path)

                        return (
                          <button
                            class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                            classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                            onClick={() => props.onAtSelect(item)}
                            onMouseEnter={() => props.setAtActive(key)}
                          >
                            <FileIcon node={{ path: item.path, type: "file" }} class="shrink-0 size-4" />
                            <div class="flex items-center text-14-regular min-w-0">
                              <span class="text-text-weak whitespace-nowrap truncate min-w-0">{directory}</span>
                              <Show when={!isDirectory}>
                                <span class="text-text-strong whitespace-nowrap">{filename}</span>
                              </Show>
                            </div>
                          </button>
                        )
                      }}
                    </For>
                  </>
                )}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "hash"}>
            <Show
              when={props.hashFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyResults")}</div>}
            >
              <For each={props.hashFlat.slice(0, 10)}>
                {(item) => {
                  const key = `${item.type}-${item.name}`

                  if (item.type === "entity") {
                    return (
                      <button
                        class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                        classList={{ "bg-surface-raised-base-hover": props.hashActive === key }}
                        onClick={() => props.onHashSelect(item)}
                        onMouseEnter={() => props.setHashActive(key)}
                      >
                        <Icon name="archive" size="small" class="text-icon-success-active shrink-0" />
                        <div class="flex flex-col items-start min-w-0">
                          <span class="text-14-regular text-text-strong whitespace-nowrap">#{item.name}</span>
                          <span class="text-12-regular text-text-weak truncate">{item.display}</span>
                        </div>
                      </button>
                    )
                  }

                  return (
                    <button
                      class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                      classList={{ "bg-surface-raised-base-hover": props.hashActive === key }}
                      onClick={() => props.onHashSelect(item)}
                      onMouseEnter={() => props.setHashActive(key)}
                    >
                      <Icon name="code" size="small" class="text-icon-warning-active shrink-0" />
                      <div class="flex flex-col items-start min-w-0">
                        <span class="text-14-regular text-text-strong whitespace-nowrap">#{item.name}</span>
                        <span class="text-12-regular text-text-weak">{item.symbolType}</span>
                      </div>
                    </button>
                  )
                }}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "slash"}>
            <Show
              when={props.slashFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyCommands")}</div>}
            >
              <For each={props.slashFlat}>
                {(cmd) => (
                  <button
                    data-slash-id={cmd.id}
                    classList={{
                      "w-full flex items-center justify-between gap-4 rounded-md px-2 py-1": true,
                      "bg-surface-raised-base-hover": props.slashActive === cmd.id,
                    }}
                    onClick={() => props.onSlashSelect(cmd)}
                    onMouseEnter={() => props.setSlashActive(cmd.id)}
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-14-regular text-text-strong whitespace-nowrap">/{cmd.trigger}</span>
                      <Show when={cmd.description}>
                        <span class="text-14-regular text-text-weak truncate">{cmd.description}</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <Show when={cmd.type === "custom" && cmd.source !== "command"}>
                        <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                          {cmd.source === "skill"
                            ? props.t("prompt.slash.badge.skill")
                            : cmd.source === "mcp"
                              ? props.t("prompt.slash.badge.mcp")
                              : props.t("prompt.slash.badge.custom")}
                        </span>
                      </Show>
                      <Show when={props.commandKeybind(cmd.id)}>
                        <span class="text-12-regular text-text-subtle">{props.commandKeybind(cmd.id)}</span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "wiki"}>
            <Show
              when={props.wikiFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyResults")}</div>}
            >
              <For each={props.wikiFlat.slice(0, 10)}>
                {(item) => {
                  const key = `${item.namespace}:${item.target}`
                  const icon = () => {
                    switch (item.namespace) {
                      case "issue":
                        return "checklist"
                      case "milestone":
                        return "trophy"
                      case "decision":
                        return "brain"
                      case "file":
                        return "file"
                      default:
                        return "archive"
                    }
                  }

                  return (
                    <button
                      class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                      classList={{ "bg-surface-raised-base-hover": props.wikiActive === key }}
                      onClick={() => props.onWikiSelect(item)}
                      onMouseEnter={() => props.setWikiActive(key)}
                    >
                      <Icon name={icon()} size="small" class="text-icon-info-active shrink-0" />
                      <div class="flex flex-col items-start min-w-0">
                        <span class="text-14-regular text-text-strong whitespace-nowrap">[[{item.target}]]</span>
                        <span class="text-12-regular text-text-weak truncate">{item.display}</span>
                      </div>
                      <span class="ml-auto shrink-0 text-10-medium text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                        {item.namespace}
                      </span>
                    </button>
                  )
                }}
              </For>
            </Show>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
