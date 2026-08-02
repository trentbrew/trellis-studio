import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ServerConnection } from "@/context/server"

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function auth({ server, bearerToken }: { server: ServerConnection.HttpBase; bearerToken?: string }) {
  if (bearerToken) return { Authorization: `Bearer ${bearerToken}` }
  if (!server.password) return
  return {
    Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
  }
}

export function createSdkForServer({
  server,
  bearerToken,
  ...config
}: Omit<NonNullable<Parameters<typeof createOpencodeClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
  bearerToken?: string
}) {
  const headers = auth({ server, bearerToken })

  return createOpencodeClient({
    ...config,
    headers: { ...config.headers, ...headers },
    baseUrl: server.url,
  })
}

export function createServerFetch({
  server,
  bearerToken,
  fetch: next,
}: {
  server: ServerConnection.HttpBase
  bearerToken?: string
  fetch?: Fetcher
}) {
  const run = next ?? fetch
  const headers = auth({ server, bearerToken })

  const flatten = (h: HeadersInit | undefined): Record<string, string> => {
    if (!h) return {}
    if (h instanceof Headers) return Object.fromEntries(h.entries())
    if (Array.isArray(h)) return Object.fromEntries(h)
    return { ...h }
  }

  return (input: string | URL | Request, init?: RequestInit) => {
    if (input instanceof Request) {
      return run(
        new Request(input, {
          ...init,
          headers: {
            ...Object.fromEntries(input.headers.entries()),
            ...headers,
            ...flatten(init?.headers),
          },
        }),
      )
    }

    return run(input, {
      ...init,
      headers: {
        ...headers,
        ...flatten(init?.headers),
      },
    })
  }
}
