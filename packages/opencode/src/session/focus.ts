import z from "zod"

export namespace SessionFocus {
  export const LanePayload = z.object({
    id: z.string(),
    parentLaneId: z.string().optional(),
    forkKind: z.enum(["sibling", "child"]).optional(),
    issueId: z.string().optional(),
    virtualBaseOpHash: z.string().optional(),
    unpromotedParent: z.boolean().optional(),
  })

  export const Context = z.object({
    version: z.literal(1),
    surface: z.enum([
      "whiteboard",
      "file",
      "review",
      "cms",
      "graph",
      "projection",
      "preview",
      "plan",
      "design",
      "assets",
      "terminal",
      "shell",
    ]),
    label: z.string(),
    key: z.string(),
    summary: z.string().max(120).optional(),
    payload: z.record(z.string(), z.unknown()),
    capturedAt: z.string(),
    pinned: z.boolean().optional(),
    excluded: z.boolean().optional(),
  })

  export type Info = z.infer<typeof Context>

  export const MAX_BYTES = 4 * 1024

  export function validate(input: unknown): Info | undefined {
    const parsed = Context.safeParse(input)
    if (!parsed.success) return undefined
    if (JSON.stringify(parsed.data).length > MAX_BYTES) return undefined
    return parsed.data
  }

  export function formatBlock(focus: Info): string {
    const payload = JSON.stringify(focus.payload)
    const lines = [
      "[FOCUS v1]",
      `surface: ${focus.surface}`,
      `key: ${focus.key}`,
      `label: ${focus.label}`,
    ]
    if (focus.summary) lines.push(`summary: ${focus.summary}`)
    lines.push(`payload: ${payload}`, "[/FOCUS]")
    return lines.join("\n")
  }
}
