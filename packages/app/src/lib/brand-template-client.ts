import { trellisUrl } from "@/context/trellis"

export type BrandTemplatePreset = {
  id: string
  name: string
  description?: string
  version: number
  spec: Record<string, unknown>
}

type ApiContext = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  url: string
  directory: string
}

async function safeJson<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T
  } catch {
    return undefined
  }
}

export async function fetchCloudBrandTemplates(
  brokerUrl: string,
  authToken: string,
): Promise<BrandTemplatePreset[]> {
  try {
    const res = await fetch(`${brokerUrl.replace(/\/+$/, "")}/brand-templates`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) return []
    const body = await safeJson<{ templates?: BrandTemplatePreset[] }>(res)
    return body?.templates ?? []
  } catch {
    return []
  }
}

export async function fetchBrandTemplatesForContext(
  input: {
    cloud: boolean
    brokerUrl: string | null
    authToken?: string
  } & ApiContext,
): Promise<BrandTemplatePreset[]> {
  if (input.cloud && input.brokerUrl && input.authToken) {
    const cloud = await fetchCloudBrandTemplates(input.brokerUrl, input.authToken)
    if (cloud.length) return cloud
  }
  return fetchBrandTemplatePresets(input)
}

export async function fetchBrandTemplatePresets(ctx: ApiContext): Promise<BrandTemplatePreset[]> {
  try {
    const res = await ctx.fetch(trellisUrl(ctx.url, ctx.directory, "/brand/templates"))
    if (!res.ok) return []
    const data = await safeJson<BrandTemplatePreset[]>(res)
    return data ?? []
  } catch {
    return []
  }
}

export async function applyBrandTemplate(template: BrandTemplatePreset, ctx: ApiContext) {
  const res = await ctx.fetch(trellisUrl(ctx.url, ctx.directory, "/brand/apply-template"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  })
  if (!res.ok) {
    const body = await safeJson<{ error?: string }>(res)
    throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`)
  }
  return safeJson(res)
}

export async function applyCloudBrandTemplate(input: {
  brokerUrl: string
  authToken: string
  projectId: string
  templateId: string
}) {
  const res = await fetch(`${input.brokerUrl.replace(/\/+$/, "")}/project/${input.projectId}/brand/apply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ templateId: input.templateId }),
  })
  if (!res.ok) {
    const body = await safeJson<{ error?: string }>(res)
    throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`)
  }
  return safeJson(res)
}

export function cloudProjectIdFromUrl(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("project")
}
