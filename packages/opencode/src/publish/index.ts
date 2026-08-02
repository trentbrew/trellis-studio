import path from "node:path"
import { Preview } from "@/preview/manager"
import { BrokerError, beginPublish, commitPublish, type PublishVisibility } from "./broker-client"
import { inferPublishBuild, resolvePublishBuild, type PublishBuildPlan } from "./build-plan"
import { loadManifestFiles } from "./files"
import { buildManifest } from "./manifest"
import { runPublishBuild } from "./run-build"
import { uploadArtifact } from "./upload"
import type { PublishError } from "./types"

export type PublishPhase =
  | "planning"
  | "building"
  | "manifest"
  | "uploading"
  | "committing"
  | "done"
  | "error"

export interface PublishOptions {
  projectDir: string
  projectId: string
  brokerUrl: string
  authToken: string
  slug: string
  visibility?: PublishVisibility
  buildCommand?: string | null
  outputDir?: string
  spaFallback?: boolean
  onPhase?: (phase: PublishPhase) => void
  onProgress?: (done: number, total: number) => void
  onLog?: (line: string) => void
  abort?: AbortSignal
  fetchImpl?: typeof fetch
}

export interface PublishOk {
  ok: true
  url: string
  version: string
  plan: PublishBuildPlan
}

export interface PublishErr {
  ok: false
  phase: PublishPhase
  error: PublishError | { error: string; message?: string }
  plan?: PublishBuildPlan
}

export type PublishResult = PublishOk | PublishErr

const LOG_NAME = "publish"

function emitLog(line: string, onLog?: (line: string) => void) {
  if (onLog) {
    onLog(line)
    return
  }
  try {
    Preview.appendConsole({
      level: "info",
      args: [line],
      name: LOG_NAME,
    })
  } catch {
    // Outside an OpenCode instance (unit tests).
  }
}

/**
 * End-to-end publish: optional build → manifest → broker begin → R2 upload → commit.
 * Failed builds do not call commit (prior live version stays live on the broker).
 */
export async function publish(opts: PublishOptions): Promise<PublishResult> {
  const broker = {
    brokerUrl: opts.brokerUrl,
    projectId: opts.projectId,
    authToken: opts.authToken,
    fetchImpl: opts.fetchImpl,
  }

  let phase: PublishPhase = "planning"
  opts.onPhase?.(phase)

  let plan: PublishBuildPlan
  try {
    const inferred = await inferPublishBuild(opts.projectDir)
    plan = resolvePublishBuild(inferred, {
      buildCommand: opts.buildCommand,
      outputDir: opts.outputDir,
      spaFallback: opts.spaFallback,
    })
    emitLog(
      plan.buildCommand
        ? `Publish: build with \`${plan.buildCommand}\`, output ./${plan.outputDir}`
        : `Publish: static site from ./${plan.outputDir}`,
      opts.onLog,
    )
  } catch (e) {
    return fail("planning", e, undefined, opts.onLog)
  }

  if (plan.buildCommand) {
    phase = "building"
    opts.onPhase?.(phase)
    emitLog(`Running ${plan.buildCommand}…`, opts.onLog)
    try {
      await runPublishBuild({
        command: plan.buildCommand,
        cwd: opts.projectDir,
        onLine: (line) => emitLog(line, opts.onLog),
        abort: opts.abort,
      })
      emitLog("Build finished.", opts.onLog)
    } catch (e) {
      return fail("building", e, plan, opts.onLog)
    }
  }

  phase = "manifest"
  opts.onPhase?.(phase)
  const outputRoot = path.join(opts.projectDir, plan.outputDir)
  const manifest = await buildManifest(outputRoot)
  if (!manifest.ok) {
    return { ok: false, phase: "manifest", error: manifest.error, plan }
  }
  emitLog(
    `Manifest: ${manifest.entries.length} files (${manifest.totalBytes} bytes), version ${manifest.version}`,
    opts.onLog,
  )

  phase = "uploading"
  opts.onPhase?.(phase)
  let credential
  try {
    credential = await beginPublish({
      ...broker,
      slug: opts.slug,
      manifest: manifest.entries,
      visibility: opts.visibility,
      spaFallback: plan.spaFallback,
    })
  } catch (e) {
    return fail("uploading", e, plan, opts.onLog)
  }

  const files = await loadManifestFiles(outputRoot, manifest.entries)
  const upload = await uploadArtifact({
    credential,
    files,
    fetchImpl: opts.fetchImpl,
    onProgress: opts.onProgress,
  })
  if (!upload.ok) {
    const first = upload.failed[0]
    return {
      ok: false,
      phase: "uploading",
      plan,
      error: {
        error: "MANIFEST_MISMATCH",
        message: first ? `${first.path}: ${first.error}` : "upload failed",
      },
    }
  }
  emitLog(`Uploaded ${upload.uploaded.length} files.`, opts.onLog)

  phase = "committing"
  opts.onPhase?.(phase)
  try {
    const committed = await commitPublish({
      ...broker,
      slug: opts.slug,
      version: manifest.version,
    })
    phase = "done"
    opts.onPhase?.(phase)
    emitLog(`Live at ${committed.url}`, opts.onLog)
    return { ok: true, url: committed.url, version: manifest.version, plan }
  } catch (e) {
    return fail("committing", e, plan, opts.onLog)
  }
}

function fail(
  phase: PublishPhase,
  err: unknown,
  plan: PublishBuildPlan | undefined,
  onLog?: (line: string) => void,
): PublishErr {
  const message = err instanceof Error ? err.message : String(err)
  emitLog(`Publish failed: ${message}`, onLog)
  if (err instanceof BrokerError) {
    return {
      ok: false,
      phase,
      plan,
      error: {
        error: err.code as PublishError["error"],
        message: err.message,
      },
    }
  }
  return {
    ok: false,
    phase,
    plan,
    error: { error: "MANIFEST_MISMATCH", message },
  }
}

export { inferPublishBuild, resolvePublishBuild } from "./build-plan"
export type { PublishBuildPlan } from "./build-plan"
export { checkSlugAvailability } from "./broker-client"
export type { PublishVisibility } from "./broker-client"
