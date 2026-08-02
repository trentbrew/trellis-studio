import { Dialog } from "@opencode-ai/ui/dialog"
import { For } from "solid-js"
import type { PublishBlock } from "@/components/cms/schema"

export function DialogPublishChecklist(props: {
  blocks: PublishBlock[]
  label: (id: string) => string
  short: (id: string) => string
}) {
  return (
    <Dialog
      title="Can't publish yet"
      description={`${props.blocks.length} ${props.blocks.length === 1 ? "entry is" : "entries are"} missing required fields.`}
      size="large"
    >
      <div class="flex max-h-[min(420px,60vh)] flex-col gap-2 overflow-y-auto">
        <For each={props.blocks}>
          {(block) => (
            <div class="rounded-md border border-border-weaker-base bg-surface-raised-base/20 px-3 py-2">
              <div class="flex min-w-0 items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-12-medium text-text-base">{props.label(block.id)}</span>
                <span class="shrink-0 font-mono text-10-regular text-text-weaker">{props.short(block.id)}</span>
              </div>
              <ul class="mt-1.5 flex flex-wrap gap-1">
                <For each={block.missing}>
                  {(name) => (
                    <li class="rounded bg-amber-500/10 px-1.5 py-0.5 text-10-medium text-amber-400">{name}</li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
        <p class="text-11-regular text-text-weaker">Fill in the missing fields, then try publishing again.</p>
      </div>
    </Dialog>
  )
}
