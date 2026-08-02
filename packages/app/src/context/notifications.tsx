import { createContext, createEffect, createMemo, on, onCleanup, useContext, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { TOAST_EVENT, type ToastEventDetail } from "@opencode-ai/ui/toast"
import { useTrellisOptional } from "./trellis"

export type Notification = {
  id: string
  title: string
  type: "op" | "toast" | "issue"
  timestamp: number
  read: boolean
}

type NotificationsValue = {
  items: () => Notification[]
  unread: () => number
  latest: () => Notification | undefined
  markRead: (id: string) => void
  markAllRead: () => void
  push: (title: string, type: Notification["type"]) => void
}

const Ctx = createContext<NotificationsValue>()

const MAX = 50

export function NotificationsProvider(props: ParentProps) {
  const trellis = useTrellisOptional()
  const [store, set] = createStore<{ items: Notification[]; seen: Set<string> }>({
    items: [],
    seen: new Set(),
  })

  const push = (title: string, type: Notification["type"]) => {
    const item: Notification = {
      id: crypto.randomUUID(),
      title,
      type,
      timestamp: Date.now(),
      read: false,
    }
    set(
      produce((s) => {
        s.items.unshift(item)
        if (s.items.length > MAX) s.items.length = MAX
      }),
    )
  }

  const toast = (evt: Event) => {
    const detail = (evt as CustomEvent<ToastEventDetail>).detail
    const text = [detail?.title, detail?.description].filter((part): part is string => !!part).join(": ")
    if (!text) return
    push(text, "toast")
  }
  if (typeof window !== "undefined") {
    window.addEventListener(TOAST_EVENT, toast)
    onCleanup(() => window.removeEventListener(TOAST_EVENT, toast))
  }

  // Watch trellis issues for new entries
  createEffect(
    on(
      () => trellis?.issues?.map((i) => i.id).join(",") ?? "",
      (curr, prev) => {
        if (prev === undefined) return
        const old = new Set(prev.split(",").filter(Boolean))
        for (const issue of trellis?.issues ?? []) {
          if (old.has(issue.id)) continue
          push(`Issue created: ${issue.title}`, "issue")
        }
      },
    ),
  )

  // Watch work units
  createEffect(
    on(
      () => trellis?.workUnits?.map((w) => w.id).join(",") ?? "",
      (curr, prev) => {
        if (prev === undefined) return
        const old = new Set(prev.split(",").filter(Boolean))
        for (const wu of trellis?.workUnits ?? []) {
          if (old.has(wu.id)) continue
          push(`Work unit: ${wu.title}`, "op")
        }
      },
    ),
  )

  const items = () => store.items
  const unread = createMemo(() => store.items.filter((n) => !n.read).length)
  const latest = createMemo(() => store.items[0])

  const markRead = (id: string) => {
    set("items", (n) => n.id === id, "read", true)
  }

  const markAllRead = () => {
    set("items", () => true, "read", true)
  }

  const value: NotificationsValue = { items, unread, latest, markRead, markAllRead, push }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

export function useNotifications() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider")
  return ctx
}

export function useNotificationsOptional() {
  return useContext(Ctx)
}
