import { DockviewLayout } from "./session/dockview-layout"
import { createSignal, Show } from "solid-js"

const FEATURE_FLAG = import.meta.env.VITE_DOCKVIEW_LAYOUT === "true"

export default function DockviewTestPage() {
  const [enabled, setEnabled] = createSignal(FEATURE_FLAG)

  const panels = [
    {
      id: "terminal",
      title: "Terminal",
      component: () => <div class="bg-surface-base p-4 rounded">Terminal Panel Content</div>,
    },
    {
      id: "sidebar",
      title: "Agent Sidebar",
      component: () => <div class="bg-surface-base p-4 rounded">Agent Sidebar Content</div>,
    },
    {
      id: "editor",
      title: "Editor",
      component: () => <div class="bg-surface-base p-4 rounded">Editor Content</div>,
    },
  ]

  return (
    <div class="h-screen w-screen bg-background-base">
      <div class="h-full flex flex-col">
        <div class="p-4 border-b border-border-base flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold">Dockview Layout Test</h1>
            <p class="text-sm text-text-weak">Drag panel tabs to reorder, resize panels by dragging edges</p>
          </div>
          <button
            onClick={() => setEnabled(!enabled())}
            class="px-3 py-1.5 text-sm rounded-md border border-border-base bg-surface-raised-base hover:bg-surface-raised-base-hover transition-colors"
          >
            {enabled() ? "Disable" : "Enable"} Dockview
          </button>
        </div>
        <div class="flex-1 overflow-hidden">
          <Show when={enabled()}>
            <DockviewLayout panels={panels} />
          </Show>
          <Show when={!enabled()}>
            <div class="h-full flex items-center justify-center text-text-weak">
              <div class="text-center">
                <p class="text-lg mb-2">Dockview layout disabled</p>
                <p class="text-sm">Click the button above to enable the new layout system</p>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
