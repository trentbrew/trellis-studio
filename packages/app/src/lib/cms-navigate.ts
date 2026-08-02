export type CmsNavTarget = {
  collection?: string
  entry?: string
}

let pending: CmsNavTarget | undefined

export function pushCmsNav(target: CmsNavTarget) {
  pending = { ...pending, ...target }
  window.dispatchEvent(new CustomEvent("cms-navigate", { detail: pending }))
}

export function takeCmsNav() {
  const target = pending
  pending = undefined
  return target
}
