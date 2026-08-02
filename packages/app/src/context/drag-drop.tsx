import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"

type DragType = "image" | "@mention" | null

interface DragDropState {
  draggingType: DragType
}

interface DragDropContextValue {
  draggingType: () => DragType
  setDraggingType: (type: DragType) => void
}

const DragDropContext = createContext<DragDropContextValue>()

export function DragDropProvider(props: ParentProps) {
  const [store, setStore] = createStore<DragDropState>({
    draggingType: null,
  })

  const value: DragDropContextValue = {
    draggingType: () => store.draggingType,
    setDraggingType: (type) => setStore("draggingType", type),
  }

  return <DragDropContext.Provider value={value}>{props.children}</DragDropContext.Provider>
}

export function useDragDrop() {
  const context = useContext(DragDropContext)
  if (!context) throw new Error("useDragDrop must be used within DragDropProvider")
  return context
}
