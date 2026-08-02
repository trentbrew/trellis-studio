import { Popover } from "@opencode-ai/ui/popover"
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js"
import { useNotificationsOptional, type Notification } from "@/context/notifications"
import { EntityIcon, entityColor } from "@/lib/entity-theme"

// Map notification kinds to entity-theme types so we reuse the shared
// icon+color palette. "toast" has no dedicated entity glyph, so it falls
// back to the generic "thing" icon/color.
const typeEntity: Record<Notification["type"], string> = {
  op: "op",
  toast: "thing",
  issue: "issue",
}

const EXIT_MS = 260

export function NotificationSegment() {
  const noti = useNotificationsOptional()
  const [shown, setShown] = createSignal(false)
  const [toast, setToast] = createSignal<Notification | undefined>()
  const [exiting, setExiting] = createSignal(false)
  const timers = new Set<ReturnType<typeof setTimeout>>()

  // Show toast for latest notification, auto-dismiss after 5s. We trigger an
  // explicit exit state first so the badge can animate out before unmounting.
  createEffect(
    on(
      () => noti?.latest(),
      (item) => {
        if (!item || item.read) return
        setExiting(false)
        setToast(item)
        const hold = setTimeout(() => setExiting(true), 5000)
        const drop = setTimeout(() => {
          setToast(undefined)
          setExiting(false)
          timers.delete(hold)
          timers.delete(drop)
        }, 5000 + EXIT_MS)
        timers.add(hold)
        timers.add(drop)
        return () => {
          clearTimeout(hold)
          clearTimeout(drop)
          timers.delete(hold)
          timers.delete(drop)
        }
      },
    ),
  )
  onCleanup(() => {
    for (const timer of timers) clearTimeout(timer)
  })

  const count = () => noti?.unread() ?? 0
  const items = () => noti?.items() ?? []

  return (
    <div class="flex flex-row flex-nowrap items-center gap-0! shrink-0">
      <Popover
        open={shown()}
        onOpenChange={(open) => {
          setShown(open)
          if (open) noti?.markAllRead()
        }}
        placement="bottom-end"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[300px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div class="relative flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors shrink-0">
            <Icon name="bell" size="small" class="text-text-weak" style={{ "font-size": "14px" }} />
            <Show when={count() > 0}>
              <span
                class="absolute -top-0.5 -right-0.5 text-[9px] font-bold tabular-nums leading-none px-1 py-0.5 rounded-full"
                style={{ background: "rgb(239, 68, 68)", color: "white" }}
              >
                {count()}
              </span>
            </Show>
          </div>
        }
      >
        <Show when={shown()}>
          <div
            class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px] max-h-[300px] overflow-y-auto"
            style={{ background: "var(--background-strong)" }}
          >
            <div class="text-[11px] font-semibold mb-2 opacity-80">Notifications</div>
            <Show when={items().length === 0}>
              <div class="text-[11px] opacity-50 py-4 text-center">No notifications yet</div>
            </Show>
            <For each={items().slice(0, 20)}>
              {(item) => (
                <div class="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <EntityIcon
                    type={typeEntity[item.type]}
                    size={14}
                    class="mt-0.5"
                    color={item.read ? "var(--text-weak)" : entityColor(typeEntity[item.type])}
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-[11px] opacity-80 truncate">{item.title}</div>
                    <div class="text-[9px] opacity-40 tabular-nums">{ago(item.timestamp)}</div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Popover>

      {/* Animated toast slot — always mounted so surrounding status-bar
          items smoothly glide aside via max-width/opacity transitions
          instead of jumping when the toast mounts/unmounts. */}
      <div
        class="overflow-hidden shrink-0"
        style={{
          "max-width": toast() && !exiting() ? "520px" : "0px",
          opacity: toast() && !exiting() ? 1 : 0,
          transform: toast() && !exiting() ? "translateX(0)" : "translateX(8px)",
          transition: "max-width 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease, transform 260ms ease",
        }}
      >
        <Show when={toast()}>
          {(item) => {
            const type = typeEntity[item().type]
            const color = entityColor(type)
            return (
              <div
                class="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full text-[11px] font-medium cursor-pointer hover:bg-white/10 transition-colors ml-1"
                style={{
                  background: "var(--background-strong)",
                  border: "1px solid var(--border-base)",
                  color: "var(--text-base)",
                }}
                onClick={() => setShown(true)}
              >
                <EntityIcon type={type} size={14} color={color} />
                <span class="truncate max-w-[460px]">{item().title}</span>
              </div>
            )
          }}
        </Show>
      </div>
    </div>
  )
}

function ago(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
