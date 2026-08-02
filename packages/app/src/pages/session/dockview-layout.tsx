import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { DockviewSolid, DockviewApi, IDockviewPanelProps, DockviewReadyEvent } from "@arminmajerie/dockview-solid"
import "dockview-core/dist/styles/dockview.css"
import { persisted, Persist } from "@/utils/persist"

type PanelConfig = {
  id: string
  title: string
  component: () => any
}

const STORAGE_KEY = "dockview-layout"

export function DockviewLayout(props: { panels: PanelConfig[] }) {
  const [api, setApi] = createSignal<DockviewApi | undefined>()
  const [layout, setLayout, , layoutReady] = persisted(
    Persist.global(STORAGE_KEY, [`${STORAGE_KEY}.v1`]),
    createStore<{ data: string | null }>({ data: null }),
  )

  const handleReady = (event: DockviewReadyEvent) => {
    setApi(event.api)
    const dockview = event.api

    // Restore layout if available
    if (layoutReady() && layout.data) {
      try {
        dockview.fromJSON(JSON.parse(layout.data))
      } catch (e) {
        console.error("Failed to restore dockview layout:", e)
        // Fall back to default layout
        addDefaultPanels(dockview)
      }
    } else {
      addDefaultPanels(dockview)
    }

    // Save layout on changes
    dockview.onDidLayoutChange(() => {
      setLayout("data", JSON.stringify(dockview.toJSON()))
    })
  }

  const addDefaultPanels = (dockview: DockviewApi) => {
    // Add first panel
    dockview.addPanel({
      id: props.panels[0].id,
      title: props.panels[0].title,
      component: "default",
      params: { content: props.panels[0].component },
    })

    // Add subsequent panels to the right
    for (let i = 1; i < props.panels.length; i++) {
      dockview.addPanel({
        id: props.panels[i].id,
        title: props.panels[i].title,
        component: "default",
        params: { content: props.panels[i].component },
        position: {
          referencePanel: props.panels[i - 1].id,
          direction: "right",
        },
      })
    }
  }

  return (
    <div class="h-full w-full">
      <DockviewSolid
        components={{
          default: (panelProps: IDockviewPanelProps) => {
            const content = panelProps.params.content as () => any
            const ContentComponent = content
            return (
              <div class="h-full w-full overflow-hidden p-4">
                <ContentComponent />
              </div>
            )
          },
        }}
        onReady={handleReady}
      />
    </div>
  )
}
