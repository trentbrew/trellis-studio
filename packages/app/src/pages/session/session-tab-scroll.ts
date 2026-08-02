export const sessionTabListScrollLeft = (el: HTMLDivElement) =>
  Math.max(0, el.scrollWidth - el.clientWidth)

export const scrollSessionTabListToEnd = (el: HTMLDivElement, behavior: ScrollBehavior = "smooth") => {
  const left = sessionTabListScrollLeft(el)
  if (Math.abs(el.scrollLeft - left) < 1) return
  el.scrollTo({ left, behavior })
}

export const scrollSessionTabIntoView = (el: HTMLDivElement, sessionID: string) => {
  const trigger = el.querySelector(`[data-slot="tabs-trigger-wrapper"][data-value="${CSS.escape(sessionID)}"]`)
  if (!trigger) {
    scrollSessionTabListToEnd(el)
    return
  }
  trigger.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" })
}

export const createSessionTabListSync = (input: {
  el: HTMLDivElement
  activeId: () => string | undefined
}) => {
  let frame: number | undefined
  let prevScrollWidth = input.el.scrollWidth
  let prevActive = input.activeId()

  const schedule = (fn: () => void) => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = undefined
      fn()
    })
  }

  const onListChange = () => {
    const scrollWidth = input.el.scrollWidth
    const grew = scrollWidth > prevScrollWidth + 1
    prevScrollWidth = scrollWidth
    if (grew) scrollSessionTabListToEnd(input.el)
  }

  const onActiveChange = (id: string | undefined) => {
    if (!id || id === "new") {
      scrollSessionTabListToEnd(input.el)
      return
    }
    scrollSessionTabIntoView(input.el, id)
  }

  const observer = new MutationObserver(() => schedule(onListChange))
  observer.observe(input.el, { childList: true, subtree: true })

  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    input.el.scrollLeft += e.deltaY > 0 ? 50 : -50
    e.preventDefault()
  }

  input.el.addEventListener("wheel", onWheel, { passive: false })

  schedule(() => onActiveChange(input.activeId()))

  const stop = () => {
    input.el.removeEventListener("wheel", onWheel)
    observer.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
  }

  return {
    stop,
    syncActive: () => {
      const id = input.activeId()
      if (id === prevActive) return
      prevActive = id
      schedule(() => onActiveChange(id))
    },
    scrollToEnd: () =>
      schedule(() => {
        scrollSessionTabListToEnd(input.el)
        requestAnimationFrame(() => scrollSessionTabListToEnd(input.el))
      }),
  }
}
