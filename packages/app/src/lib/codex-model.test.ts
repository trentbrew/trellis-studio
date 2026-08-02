import { describe, expect, test } from "bun:test"

import {
  isOpenaiCodexSubscription,
  pickPreferredCodexModel,
  preferredCodexModelKey,
} from "./codex-model"

describe("pickPreferredCodexModel", () => {
  test("prefers gpt-5.3-codex when available", () => {
    expect(pickPreferredCodexModel(["gpt-5.1-codex", "gpt-5.3-codex", "gpt-5.2-codex"])).toBe("gpt-5.3-codex")
  })

  test("falls back to any codex model", () => {
    expect(pickPreferredCodexModel(["gpt-5.1-codex-mini"])).toBe("gpt-5.1-codex-mini")
  })

  test("skips codex-spark models unsupported on ChatGPT OAuth", () => {
    expect(pickPreferredCodexModel(["gpt-5.3-codex-spark", "gpt-5.2-codex"])).toBe("gpt-5.2-codex")
  })

  test("returns undefined when no codex models", () => {
    expect(pickPreferredCodexModel(["gpt-4o", "gpt-5.2"])).toBeUndefined()
  })
})

describe("isOpenaiCodexSubscription", () => {
  test("detects oauth-filtered catalog", () => {
    expect(
      isOpenaiCodexSubscription({
        "gpt-5.3-codex": {},
        "gpt-5.2": {},
        "gpt-5.4-mini": {},
      }),
    ).toBe(true)
  })

  test("rejects full api-key catalog", () => {
    expect(
      isOpenaiCodexSubscription({
        "gpt-5.3-codex": {},
        "gpt-4o": {},
      }),
    ).toBe(false)
  })
})

describe("preferredCodexModelKey", () => {
  test("returns provider and model ids", () => {
    expect(preferredCodexModelKey({ "gpt-5.3-codex": {} })).toEqual({
      providerID: "openai",
      modelID: "gpt-5.3-codex",
    })
  })
})
