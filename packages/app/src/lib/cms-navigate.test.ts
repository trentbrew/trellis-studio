import { describe, expect, test } from "bun:test"
import { pushCmsNav, takeCmsNav } from "./cms-navigate"

describe("cms-navigate", () => {
  test("queues navigation until consumed", () => {
    takeCmsNav()
    pushCmsNav({ collection: "person", entry: "person:a1bbe565" })
    expect(takeCmsNav()).toEqual({ collection: "person", entry: "person:a1bbe565" })
    expect(takeCmsNav()).toBeUndefined()
  })

  test("merges repeated pushes before consume", () => {
    takeCmsNav()
    pushCmsNav({ collection: "person" })
    pushCmsNav({ entry: "person:a1bbe565" })
    expect(takeCmsNav()).toEqual({ collection: "person", entry: "person:a1bbe565" })
  })
})
