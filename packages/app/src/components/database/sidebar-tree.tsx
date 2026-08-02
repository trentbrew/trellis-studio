import type { JSX } from "solid-js"

/** Vertical guide for nested sidebar rows (file-tree style). */
export function SidebarTree(props: { children: JSX.Element }) {
  return <div class="ml-3.5 border-l border-border-weaker-base/70 pl-1.5">{props.children}</div>
}
