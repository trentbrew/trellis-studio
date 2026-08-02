function firstZodIssueMessage(issues: unknown): string | undefined {
  if (!Array.isArray(issues) || issues.length === 0) return undefined
  const first = issues[0]
  if (!first || typeof first !== "object") return undefined
  const message = (first as Record<string, unknown>).message
  if (typeof message === "string" && message) return message
  const path = (first as Record<string, unknown>).path
  if (Array.isArray(path) && path.length > 0) {
    return `Invalid ${path.join(".")}`
  }
  return undefined
}

export function apiErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback
  const record = body as Record<string, unknown>
  const error = record.error
  if (typeof error === "string" && error) return error
  if (error instanceof Error && error.message) return error.message
  const zodMessage = firstZodIssueMessage(error) ?? firstZodIssueMessage(record.errors)
  if (zodMessage) return zodMessage
  return fallback
}
