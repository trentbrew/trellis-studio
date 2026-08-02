import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Preview } from "@/preview/manager"
import { Instance } from "@/project/instance"
import { checkSlugAvailability, inferPublishBuild, publish, resolvePublishBuild } from "@/publish"
import { errors } from "../error"
import { lazy } from "@/util/lazy"

const PublishBody = z.object({
  projectId: z.string().min(1),
  brokerUrl: z.string().min(1),
  slug: z.string().min(3).max(63),
  visibility: z.enum(["public", "unlisted"]).optional(),
  buildCommand: z.string().nullable().optional(),
  outputDir: z.string().optional(),
  spaFallback: z.boolean().optional(),
})

const PublishPlan = z.object({
  buildCommand: z.string().nullable(),
  outputDir: z.string(),
  spaFallback: z.boolean(),
})

const PublishResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    url: z.string(),
    version: z.string(),
    plan: PublishPlan,
  }),
  z.object({
    ok: z.literal(false),
    phase: z.string(),
    error: z.object({
      error: z.string(),
      message: z.string().optional(),
    }),
    plan: PublishPlan.optional(),
  }),
])

function bearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!header) return undefined
  return header.startsWith("Bearer ") ? header.slice(7) : header
}

export const PublishRoutes = lazy(() =>
  new Hono()
    .get(
      "/plan",
      describeRoute({
        summary: "Infer publish build settings",
        description: "Detect build command, output directory, and SPA fallback for the current project.",
        operationId: "publish.plan",
        responses: {
          200: {
            description: "Inferred publish plan",
            content: {
              "application/json": {
                schema: resolver(PublishPlan),
              },
            },
          },
        },
      }),
      async (c) => {
        const plan = await inferPublishBuild(Instance.directory)
        return c.json(plan)
      },
    )
    .get(
      "/check",
      describeRoute({
        summary: "Check slug availability",
        description: "Proxy slug availability check to the Trellis cloud broker.",
        operationId: "publish.check",
        responses: {
          200: {
            description: "Slug availability",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    slug: z.string(),
                    available: z.boolean(),
                    reason: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(401, 400),
        },
      }),
      async (c) => {
        const token = bearerToken(c.req.raw)
        const slug = c.req.query("slug")
        const projectId = c.req.query("projectId")
        const brokerUrl = c.req.query("brokerUrl")
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        if (!slug || !projectId || !brokerUrl) {
          return c.json({ error: "slug, projectId, and brokerUrl are required" }, 400)
        }
        const result = await checkSlugAvailability({
          brokerUrl,
          projectId,
          authToken: token,
          slug,
        })
        return c.json(result)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Publish project to the web",
        description: "Build (if needed), upload static artifacts via the broker, and flip the live slug pointer.",
        operationId: "publish.run",
        responses: {
          200: {
            description: "Publish finished or failed without breaking the prior live site",
            content: {
              "application/json": {
                schema: resolver(PublishResultSchema),
              },
            },
          },
          ...errors(401, 400),
        },
      }),
      validator("json", PublishBody),
      async (c) => {
        const token = bearerToken(c.req.raw)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const body = c.req.valid("json")
        const inferred = await inferPublishBuild(Instance.directory)
        const plan = resolvePublishBuild(inferred, {
          buildCommand: body.buildCommand,
          outputDir: body.outputDir,
          spaFallback: body.spaFallback,
        })

        const result = await publish({
          projectDir: Instance.directory,
          projectId: body.projectId,
          brokerUrl: body.brokerUrl,
          authToken: token,
          slug: body.slug,
          visibility: body.visibility,
          buildCommand: plan.buildCommand,
          outputDir: plan.outputDir,
          spaFallback: plan.spaFallback,
          onLog: (line) => {
            Preview.appendConsole({ level: "info", args: [line], name: "publish" })
          },
        })

        return c.json(result)
      },
    ),
)
