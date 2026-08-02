import { abortAfterAny } from "../util/abort"

export const EXA_URL = process.env.EXA_API_KEY
  ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(process.env.EXA_API_KEY)}`
  : "https://mcp.exa.ai/mcp"

export const PARALLEL_URL = "https://search.parallel.ai/mcp"

interface McpContent {
  type: string
  text: string
}

interface McpResult {
  result?: {
    content?: McpContent[]
  }
}

function parsePayload(payload: string): string | undefined {
  const trimmed = payload.trim()
  if (!trimmed.startsWith("{")) return undefined
  try {
    const data = JSON.parse(trimmed) as McpResult
    return data.result?.content?.find((item) => item.text)?.text
  } catch {
    return undefined
  }
}

export function parseResponse(body: string): string | undefined {
  const trimmed = body.trim()
  const direct = trimmed ? parsePayload(trimmed) : undefined
  if (direct) return direct

  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue
    const data = parsePayload(line.substring(6))
    if (data) return data
  }
  return undefined
}

export async function call(
  url: string,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<string | undefined> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Search error (${response.status}): ${errorText}`)
  }

  return parseResponse(await response.text())
}

export async function callWithTimeout(
  url: string,
  tool: string,
  args: Record<string, unknown>,
  abort: AbortSignal,
  headers: Record<string, string> = {},
  timeoutMs = 25_000,
): Promise<string | undefined> {
  const { signal, clearTimeout } = abortAfterAny(timeoutMs, abort)
  try {
    return await call(url, tool, args, signal, headers)
  } finally {
    clearTimeout()
  }
}
