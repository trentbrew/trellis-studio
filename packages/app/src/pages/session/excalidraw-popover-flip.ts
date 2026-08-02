/** Flip Radix property popovers that would open off the right edge (inspector is docked right). */

const OPEN_STATES = new Set(["open", "delayed-open"])

function isPropertiesPopover(el: Element): boolean {
  if (el.classList.contains("properties-content")) return true
  return Boolean(
    el.querySelector(".color-picker-content") ||
      el.querySelector(".dropdown-menu.fonts") ||
      el.querySelector(".dropdown-menu"),
  )
}

function adjustPopover(el: HTMLElement, root: HTMLElement) {
  const state = el.getAttribute("data-state")
  if (!state || !OPEN_STATES.has(state)) {
    if (el.dataset.trellisPopoverFlipped) {
      delete el.dataset.trellisPopoverFlipped
      el.style.removeProperty("transform")
    }
    return
  }
  if (el.getAttribute("data-side") !== "right" || !isPropertiesPopover(el)) return

  const pad = 12
  const limit = Math.min(window.innerWidth, root.getBoundingClientRect().right) - pad
  const box = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  if (cs.transform === "none") return

  const m = new DOMMatrixReadOnly(cs.transform)

  if (box.right <= limit) {
    if (el.dataset.trellisPopoverFlipped) {
      delete el.dataset.trellisPopoverFlipped
      el.style.removeProperty("transform")
    }
    return
  }

  const flipX = m.m41 - box.width - 20
  el.style.transform = `translate(${Math.round(flipX)}px, ${Math.round(m.m42)}px)`
  el.dataset.trellisPopoverFlipped = "1"
}

function adjustAll(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-side="right"]').forEach((el) => adjustPopover(el, root))
}

/** Observe Excalidraw DOM and flip overflowing inspector popovers to open leftward. */
export function installExcalidrawPopoverFlip(root: HTMLElement): () => void {
  const run = () => requestAnimationFrame(() => adjustAll(root))
  const mo = new MutationObserver(run)
  mo.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "data-side", "style"],
    childList: true,
  })
  window.addEventListener("resize", run)
  run()
  return () => {
    mo.disconnect()
    window.removeEventListener("resize", run)
  }
}
