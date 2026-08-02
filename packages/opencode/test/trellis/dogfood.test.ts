import { describe, test, expect } from "bun:test"
import os from "os"
import path from "path"

// We test the exported pure functions directly.
// The lifecycle functions (start/stop/run) depend on Instance ALS + Bus + engine,
// so we focus on detection logic and state shape.

import { detect, active, info, stop } from "../../src/trellis/dogfood"

describe("dogfood detection", () => {
  const home = os.homedir()

  test("detects turtlecode workspace path", () => {
    expect(detect(path.join(home, ".turtlecode", "workspaces", "turtlecode"))).toBe(true)
  })

  test("detects path ending in /turtlecode", () => {
    expect(detect("/some/path/turtlecode")).toBe(true)
  })

  test("detects path ending in /opencode-client", () => {
    expect(detect("/some/path/opencode-client")).toBe(true)
  })

  test("rejects unrelated directory", () => {
    expect(detect("/tmp/random-project")).toBe(false)
  })

  test("rejects partial match", () => {
    expect(detect("/tmp/not-turtlecode-extra")).toBe(false)
  })
})

describe("dogfood state", () => {
  test("initially inactive", () => {
    expect(active()).toBe(false)
  })

  test("info returns correct shape", () => {
    const i = info()
    expect(i).toHaveProperty("active")
    expect(i).toHaveProperty("last")
    expect(i).toHaveProperty("created")
    expect(i).toHaveProperty("thresholds")
    expect(i.thresholds).toHaveProperty("decision")
    expect(i.thresholds).toHaveProperty("issue")
    expect(i.thresholds).toHaveProperty("session")
    expect(i.thresholds).toHaveProperty("cooldown")
    expect(Array.isArray(i.created)).toBe(true)
  })

  test("stop is idempotent when inactive", () => {
    stop()
    expect(active()).toBe(false)
  })
})
