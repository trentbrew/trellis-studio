import { beforeEach, describe, expect, test } from "bun:test"

const src = await Bun.file(new URL("../public/oc-theme-preload.js", import.meta.url)).text()

const run = () => Function(src)()

beforeEach(() => {
  document.head.innerHTML = ""
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-color-scheme")
  localStorage.clear()
  Object.defineProperty(window, "matchMedia", {
    value: () =>
      ({
        matches: false,
      }) as MediaQueryList,
    configurable: true,
  })
})

describe("theme preload", () => {
  test("defaults to cursor when no theme is stored", () => {
    run()

    expect(document.documentElement.dataset.theme).toBe("cursor")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(localStorage.getItem("opencode-theme-id")).toBeNull()
  })

  test("migrates legacy oc-1 to cursor before mount", () => {
    localStorage.setItem("opencode-theme-id", "oc-1")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#fff;")
    localStorage.setItem("opencode-theme-css-dark", "--background-base:#000;")

    run()

    expect(document.documentElement.dataset.theme).toBe("cursor")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(localStorage.getItem("opencode-theme-id")).toBe("cursor")
    // CSS is cleared during migration, so no preload element is created
    // The theme CSS will be regenerated on first app load
    expect(localStorage.getItem("opencode-theme-css-light")).toBeNull()
    expect(localStorage.getItem("opencode-theme-css-dark")).toBeNull()
    expect(document.getElementById("oc-theme-preload")).toBeNull()
  })

  test("keeps cached css for non-default themes", () => {
    localStorage.setItem("opencode-theme-id", "nightowl")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#fff;")

    run()

    expect(document.documentElement.dataset.theme).toBe("nightowl")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:#fff;")
  })

  test("injects cached css for cursor theme", () => {
    localStorage.setItem("opencode-theme-id", "cursor")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#f7f7f7;")

    run()

    expect(document.documentElement.dataset.theme).toBe("cursor")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:#f7f7f7;")
  })
})
