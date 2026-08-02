import { cloudBrokerUrl } from "@/lib/cloud-mode"
import { cloudProjectIdFromUrl } from "@/lib/brand-template-client"

export type PublishVisibility = "public" | "unlisted"

export type PublishPlan = {
  buildCommand: string | null
  outputDir: string
  spaFallback: boolean
}

export type PublishRunResult =
  | { ok: true; url: string; version: string; plan: PublishPlan }
  | {
      ok: false
      phase: string
      error: { error: string; message?: string }
      plan?: PublishPlan
    }

type ApiContext = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  url: string
  directory: string
  authToken: string
}

function publishPath(ctx: ApiContext, suffix: string): string {
  const base = ctx.url.replace(/\/+$/, "")
  const dir = encodeURIComponent(ctx.directory)
  return `${base}/publish${suffix}?directory=${dir}`
}

export async function fetchPublishPlan(ctx: ApiContext): Promise<PublishPlan> {
  const res = await ctx.fetch(publishPath(ctx, "/plan"))
  if (!res.ok) throw new Error(`Failed to load publish plan (${res.status})`)
  return (await res.json()) as PublishPlan
}

export async function runPublishCheck(
  ctx: ApiContext,
  slug: string,
): Promise<{ slug: string; available: boolean; reason?: string }> {
  const projectId = cloudProjectIdFromUrl()
  const brokerUrl = cloudBrokerUrl()
  if (!projectId || !brokerUrl) {
    throw new Error("Publish check requires cloud project and broker URL")
  }
  const params = new URLSearchParams({
    slug,
    projectId,
    brokerUrl: brokerUrl.replace(/\/+$/, ""),
  })
  const res = await ctx.fetch(`${publishPath(ctx, "/check")}&${params}`, {
    headers: { Authorization: `Bearer ${ctx.authToken}` },
  })
  if (!res.ok) throw new Error(`Slug check failed (${res.status})`)
  return (await res.json()) as { slug: string; available: boolean; reason?: string }
}

export async function runPublish(
  ctx: ApiContext,
  input: {
    slug: string
    visibility?: PublishVisibility
    buildCommand?: string | null
    outputDir?: string
    spaFallback?: boolean
  },
): Promise<PublishRunResult> {
  const projectId = cloudProjectIdFromUrl()
  const brokerUrl = cloudBrokerUrl()
  if (!projectId || !brokerUrl) {
    throw new Error("Publish requires cloud project and broker URL")
  }
  const res = await ctx.fetch(publishPath(ctx, "/"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      brokerUrl: brokerUrl.replace(/\/+$/, ""),
      slug: input.slug,
      visibility: input.visibility ?? "public",
      buildCommand: input.buildCommand,
      outputDir: input.outputDir,
      spaFallback: input.spaFallback,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as PublishRunResult
  if (!res.ok && body && typeof body === "object" && "ok" in body) return body
  if (!res.ok) throw new Error(`Publish failed (${res.status})`)
  return body
}
