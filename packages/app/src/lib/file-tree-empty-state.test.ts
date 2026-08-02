import { describe, expect, test } from "bun:test"

import type { CloudSandboxStatus } from "@/context/cloud-sandbox"
import { isCloudWorkspaceReady, resolveFileTreePanelState } from "./file-tree-empty-state"

const readyCloud: CloudSandboxStatus = {
  lifecycle: "ready",
  runtime: "running",
  warmth: "hot",
  studioReachable: true,
  updatedAt: Date.now(),
}

describe("isCloudWorkspaceReady", () => {
  test("provisioning is not ready", () => {
    expect(
      isCloudWorkspaceReady({
        ...readyCloud,
        lifecycle: "provisioning",
        studioReachable: false,
      }),
    ).toBe(false)
  })

  test("running without studio is not ready", () => {
    expect(
      isCloudWorkspaceReady({
        ...readyCloud,
        studioReachable: false,
      }),
    ).toBe(false)
  })

  test("stopped runtime is not ready", () => {
    expect(
      isCloudWorkspaceReady({
        ...readyCloud,
        runtime: "stopped",
        warmth: "cold",
        studioReachable: false,
      }),
    ).toBe(false)
  })
})

describe("resolveFileTreePanelState", () => {
  test("shows loading while sync is loading", () => {
    expect(
      resolveFileTreePanelState({
        root: { loaded: true, loading: false },
        childCount: 0,
        syncLoading: true,
        serverHealthy: true,
        cloudActive: false,
      }),
    ).toBe("loading")
  })

  test("shows loading for empty tree while sandbox is waking", () => {
    expect(
      resolveFileTreePanelState({
        root: { loaded: true, loading: false },
        childCount: 0,
        syncLoading: false,
        serverHealthy: true,
        cloudActive: true,
        cloudStatus: {
          ...readyCloud,
          studioReachable: false,
        },
      }),
    ).toBe("loading")
  })

  test("shows error when root listing failed", () => {
    expect(
      resolveFileTreePanelState({
        root: { loaded: false, loading: false, error: "Network error" },
        childCount: 0,
        syncLoading: false,
        serverHealthy: true,
        cloudActive: false,
      }),
    ).toBe("error")
  })

  test("shows empty when loaded with no children and workspace ready", () => {
    expect(
      resolveFileTreePanelState({
        root: { loaded: true, loading: false },
        childCount: 0,
        syncLoading: false,
        serverHealthy: true,
        cloudActive: true,
        cloudStatus: readyCloud,
      }),
    ).toBe("empty")
  })

  test("shows tree when children exist", () => {
    expect(
      resolveFileTreePanelState({
        root: { loaded: true, loading: false },
        childCount: 3,
        syncLoading: false,
        serverHealthy: true,
        cloudActive: false,
      }),
    ).toBe("tree")
  })
})
