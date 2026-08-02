import z from "zod"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"
import type { Permission } from "../permission"
import type { SessionID, MessageID } from "../session/schema"
import { Truncate } from "./truncate"
import { ValidationTelemetry } from "./validation-telemetry"

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export interface InitContext {
    agent?: Agent.Info
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: SessionID
    messageID: MessageID
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    messages: MessageV2.WithParts[]
    metadata(input: { title?: string; metadata?: M }): void
    ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Promise<void>
  }
  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  function valueAtPath(args: unknown, path: PropertyKey[]): unknown {
    let cur: any = args
    for (const key of path) {
      if (cur === null || cur === undefined) return undefined
      cur = cur[key as any]
    }
    return cur
  }

  function preview(value: unknown): string {
    if (value === undefined) return "(missing)"
    if (typeof value === "string") return JSON.stringify(value)
    try {
      const s = JSON.stringify(value)
      return s.length > 60 ? s.slice(0, 57) + "…" : s
    } catch {
      return String(value)
    }
  }

  /**
   * Turn a ZodError into a per-field, self-correcting message. The model gets
   * the exact path, what was expected (including allowed enum values), and what
   * it actually sent — enough to fix the call on the next turn instead of looping.
   */
  function formatZodError(id: string, error: z.ZodError, args: unknown): string {
    const lines = error.issues.map((issue) => {
      const where = issue.path.length ? issue.path.map(String).join(".") : "(root)"
      const meta = issue as any
      const extra: string[] = []
      if (Array.isArray(meta.values)) extra.push(`allowed: ${meta.values.join(", ")}`)
      else if (meta.expected) extra.push(`expected ${meta.expected}`)
      if (Array.isArray(meta.keys) && meta.keys.length) extra.push(`unexpected key(s): ${meta.keys.join(", ")}`)
      const detail = extra.length ? `${issue.message} — ${extra.join("; ")}` : issue.message
      const got = issue.path.length ? `  (you sent: ${preview(valueAtPath(args, issue.path))})` : ""
      return `  • ${where}: ${detail}${got}`
    })
    return [`The \`${id}\` tool rejected your arguments. Fix the field(s) below and call it again:`, ...lines].join("\n")
  }

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute
        toolInfo.execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
            ValidationTelemetry.ok(id)
          } catch (error) {
            if (error instanceof z.ZodError) {
              ValidationTelemetry.fail({
                tool: id,
                sessionID: ctx.sessionID,
                issues: error.issues.map((issue) => ({
                  path: issue.path.length ? issue.path.map(String).join(".") : "(root)",
                  code: issue.code,
                })),
              })
              const message = toolInfo.formatValidationError
                ? toolInfo.formatValidationError(error)
                : formatZodError(id, error, args)
              throw new Error(message, { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }
          const result = await execute(args, ctx)
          // skip truncation for tools that handle it themselves
          if (result.metadata.truncated !== undefined) {
            return result
          }
          const truncated = await Truncate.output(result.output, {}, initCtx?.agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: truncated.outputPath }),
            },
          }
        }
        return toolInfo
      },
    }
  }
}
