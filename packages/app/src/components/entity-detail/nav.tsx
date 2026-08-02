import { createContext, useContext, type ParentProps } from "solid-js"
import { useEntityDialog } from "@/components/entity-dialog"

export type NavigateFn = (id: string, namespace?: string) => void

const NavContext = createContext<NavigateFn>()

export function EntityNavProvider(props: ParentProps<{ navigate: NavigateFn }>) {
  return <NavContext.Provider value={props.navigate}>{props.children}</NavContext.Provider>
}

export function useEntityNavigate(): NavigateFn {
  const override = useContext(NavContext)
  if (override) return override
  const dialog = useEntityDialog()
  return (id, ns) => dialog.push(id, ns)
}

// Hover is a separate channel because most consumers don't care about it;
// only the graph view currently wires a handler. Undefined when nobody listens.
export type HoverFn = (id: string | null) => void
const HoverContext = createContext<HoverFn>()

export function EntityHoverProvider(props: ParentProps<{ onHover: HoverFn }>) {
  return <HoverContext.Provider value={props.onHover}>{props.children}</HoverContext.Provider>
}

export function useEntityHover(): HoverFn | undefined {
  return useContext(HoverContext)
}
