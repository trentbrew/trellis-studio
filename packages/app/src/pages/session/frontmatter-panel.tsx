import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { buildFrontmatterControls } from "@/lib/tiptap/frontmatter-editor"
import { useModels } from "@/context/models"

export function FrontmatterPanel(props: {
  meta: Record<string, unknown>
  onChange: (meta: Record<string, unknown>) => void
  defaultOpen?: boolean
  /** `rail` = narrow column beside editor; `inline` = full-width block (entity Details tab). */
  variant?: "rail" | "inline"
}) {
  const models = useModels()
  let host: HTMLDivElement | undefined
  const inline = () => props.variant === "inline"
  const [open, setOpen] = createSignal(props.defaultOpen ?? true)

  createEffect(() => {
    const el = host
    if (!el) return
    if (!open() && !inline()) return
    el.innerHTML = ""
    const controls = buildFrontmatterControls(
      props.meta,
      (next) => props.onChange(next),
      () => models.list().map((m) => `${m.provider.id}/${m.id}`),
    )
    el.appendChild(controls)
  })

  onCleanup(() => {
    if (host) host.innerHTML = ""
  })

  const count = () => Object.keys(props.meta).length

  return (
    <aside
      data-component="frontmatter-panel"
      data-variant={inline() ? "inline" : "rail"}
      classList={{
        "flex flex-col bg-transparent": true,
        "w-full rounded-md border border-border-base/60": inline(),
        "border-l border-border-weaker-base transition-[width] duration-150 ease-out": !inline(),
        "w-72": !inline() && open(),
        "w-9": !inline() && !open(),
      }}
    >
      <div
        classList={{
          "flex items-center justify-between border-b border-border-weaker-base px-2 py-1.5": true,
          "px-3 py-2": inline(),
        }}
      >
        <button
          type="button"
          class="flex items-center gap-1.5 text-12-medium text-text-weak hover:text-text-base"
          onClick={() => !inline() && setOpen(!open())}
          disabled={inline()}
          title={inline() ? undefined : open() ? "Collapse properties" : "Expand properties"}
        >
          <Show when={!inline()}>
            <Icon name={open() ? "chevron-right" : "chevron-left"} size="small" />
          </Show>
          <Show when={open() || inline()}>
            <span>Properties</span>
            <span class="text-text-weaker">{count()}</span>
          </Show>
        </button>
      </div>
      <Show when={open() || inline()}>
        <div
          classList={{
            "flex-1 min-h-0 overflow-auto": true,
            "p-2": !inline(),
            "px-3 pb-3": inline(),
          }}
          ref={host}
        />
      </Show>
    </aside>
  )
}
