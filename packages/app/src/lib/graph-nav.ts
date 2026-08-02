import { createSignal } from "solid-js"

// Cross-component graph-node selection request. The graph view is rendered
// inside SessionSidePanel while consumers like the auto-open effect live in
// session.tsx. A small module-level signal lets either side request a node
// selection without lifting the GraphView's internal state into a context.
//
// Producers call `request(id)`; the GraphView watches `pending()` and clears
// the value once it focuses the node.

const [pending, set] = createSignal<string | undefined>()

export const graphNav = {
  pending,
  request(id: string) {
    set(id)
  },
  clear() {
    if (pending() !== undefined) set(undefined)
  },
}
