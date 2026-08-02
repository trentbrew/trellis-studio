import type { Session } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { For, Show, createMemo, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { SessionAgentIcon } from "@/components/session/session-agent-icon"
import { useLanguage } from "@/context/language"
import { groupSessionsByDate } from "@/lib/session-thread-groups"
import { Persist, persisted } from "@/utils/persist"

export const SESSION_THREAD_SIDEBAR_WIDTH = 280

export type SessionThreadSidebarProps = {
  sessions: Accessor<Session[]>
  activeId: Accessor<string | undefined>
  slug: string
  creating?: Accessor<boolean>
  isBusy?: (sessionID: string) => boolean
  onSelect: (sessionID: string) => void
  onNew: () => void
  onArchive?: (session: Session) => void
}

export function SessionThreadSidebar(props: SessionThreadSidebarProps) {
  const language = useLanguage()
  const [store, setStore] = persisted(
    Persist.global("session-thread-sidebar", ["session-thread-sidebar.v2"]),
    createStore({ collapsed: false, expanded: {} as Record<string, boolean> }),
  )

  const isExpanded = (label: string) => store.expanded[label] !== false

  const groups = createMemo(() => groupSessionsByDate(props.sessions()))
  const collapsed = () => store.collapsed

  const toggleCollapsed = () => setStore("collapsed", (value) => !value)

  const titleFor = (session: Session) => session.title?.trim() || session.id.slice(0, 8)

  return (
    <>
      <aside
        data-ui-region="sidebar"
        data-ui-pattern="layout.split"
        data-ui-slot="pane"
        aria-label={language.t("session.threadSidebar.label")}
        class="relative flex shrink-0 flex-col h-full overflow-hidden bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: collapsed() ? "0px" : `${SESSION_THREAD_SIDEBAR_WIDTH}px` }}
      >
        <div
          class="flex h-full min-h-0 flex-col"
          style={{ width: `${SESSION_THREAD_SIDEBAR_WIDTH}px` }}
          classList={{ "pointer-events-none opacity-0": collapsed() }}
        >
          <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pr-5 pt-3">
            <Show
              when={groups().length > 0}
              fallback={
                <p class="px-2 py-4 text-12-regular text-text-weak">{language.t("session.threadSidebar.empty")}</p>
              }
            >
              <For each={groups()}>
                {(group) => (
                  <Collapsible
                    class="mb-1"
                    variant="ghost"
                    open={isExpanded(group.labelKey)}
                    onOpenChange={(open: boolean) => setStore("expanded", group.labelKey, open)}
                  >
                    <Collapsible.Trigger class="flex items-center gap-1 px-2 py-1 w-full text-left h-auto">
                      <Icon
                        name="chevron-down"
                        size="small"
                        class="shrink-0 transition-transform duration-200 text-text-weak"
                        classList={{ "rotate-[-90deg]": !isExpanded(group.labelKey) }}
                      />
                      <span class="text-11-medium uppercase tracking-wide text-text-weak">
                        {language.t(group.labelKey)}
                      </span>
                    </Collapsible.Trigger>
                    <Collapsible.Content class="collapsible-animated">
                      <ul class="flex flex-col gap-0.5 border-l border-border-base/30 ml-3 pl-3">
                        <For each={group.sessions}>
                          {(session) => {
                            const active = () => props.activeId() === session.id
                            const busy = () => props.isBusy?.(session.id) ?? false
                            return (
                              <li>
                                <div
                                  class="group/thread relative flex w-full min-w-0 items-center rounded-lg transition-colors hover:bg-surface-raised-base-hover"
                                  classList={{
                                    "bg-surface-base-active": active(),
                                  }}
                                >
                                  <button
                                    type="button"
                                    class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base rounded-lg"
                                    onClick={() => props.onSelect(session.id)}
                                  >
                                    <SessionAgentIcon sessionID={session.id} working={busy()} />
                                    <span
                                      class="min-w-0 flex-1 truncate text-14-regular"
                                      classList={{
                                        "text-text-strong": active(),
                                        "text-text-base": !active(),
                                      }}
                                    >
                                      {titleFor(session)}
                                    </span>
                                  </button>
                                  <Show when={props.onArchive}>
                                    <div class="shrink-0 w-0 overflow-hidden opacity-0 transition-all group-hover/thread:w-8 group-hover/thread:opacity-100 group-focus-within/thread:w-8 group-focus-within/thread:opacity-100">
                                      <Tooltip value={language.t("common.archive")} placement="top">
                                        <IconButton
                                          icon="archive"
                                          variant="ghost"
                                          class="size-8 !rounded-md mr-0.5"
                                          aria-label={language.t("common.archive")}
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            props.onArchive?.(session)
                                          }}
                                        />
                                      </Tooltip>
                                    </div>
                                  </Show>
                                </div>
                              </li>
                            )
                          }}
                        </For>
                      </ul>
                    </Collapsible.Content>
                  </Collapsible>
                )}
              </For>
            </Show>
          </div>

          <div class="shrink-0 px-2 py-3">
            <Button
              variant="secondary"
              class="w-full justify-start gap-2 !rounded-lg"
              disabled={props.creating?.()}
              onClick={() => props.onNew()}
            >
              <Icon name="plus-small" size="small" />
              <span class="truncate">{language.t("command.session.new")}</span>
            </Button>
          </div>
        </div>
      </aside>

      <div
        class="absolute top-5 z-30 flex flex-col gap-1 transition-[left] duration-200 ease-out"
        style={{ left: collapsed() ? "1.25rem" : `${SESSION_THREAD_SIDEBAR_WIDTH + 20}px` }}
      >
        <Show
          when={collapsed()}
          fallback={
            <Tooltip value={language.t("session.threadSidebar.collapse")} placement="bottom">
              <IconButton
                icon="sidebar"
                variant="ghost"
                class="!rounded-md shadow-sm"
                aria-label={language.t("session.threadSidebar.collapse")}
                onClick={toggleCollapsed}
              />
            </Tooltip>
          }
        >
          <Tooltip value={language.t("session.threadSidebar.expand")} placement="bottom">
            <IconButton
              icon="sidebar"
              variant="secondary"
              class="!rounded-md shadow-sm"
              aria-label={language.t("session.threadSidebar.expand")}
              onClick={toggleCollapsed}
            />
          </Tooltip>
        </Show>
      </div>
    </>
  )
}
