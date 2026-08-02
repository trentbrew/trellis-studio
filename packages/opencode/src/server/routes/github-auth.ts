import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { GitHubAuth } from "../../github-auth"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Log } from "../../util/log"

const log = Log.create({ service: "server" })

// Simple state storage for OAuth flow (in production, use Redis or similar)
const oauthStates = new Map<string, { createdAt: number }>()

// Clean up old states periodically
setInterval(() => {
  const now = Date.now()
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      // 10 minutes
      oauthStates.delete(state)
    }
  }
}, 60 * 1000)

export const GitHubAuthRoutes = lazy(() =>
  new Hono()
    .get(
      "/config",
      describeRoute({
        summary: "Get GitHub auth config",
        description: "Check if GitHub OAuth is configured and get the authorization URL",
        operationId: "github.auth.config",
        responses: {
          200: {
            description: "GitHub auth configuration",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    configured: z.boolean(),
                    authorizeUrl: z.string().optional(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const configured = GitHubAuth.isConfigured()
        if (!configured) {
          return c.json({ configured: false })
        }

        // Generate state parameter for CSRF protection
        const state = crypto.randomUUID()
        oauthStates.set(state, { createdAt: Date.now() })

        const authorizeUrl = await GitHubAuth.getAuthorizeUrl(state)
        return c.json({ configured: true, authorizeUrl })
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get GitHub auth status",
        description: "Get current GitHub authentication status and user info",
        operationId: "github.auth.status",
        responses: {
          200: {
            description: "GitHub auth status",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    authenticated: z.boolean(),
                    user: z
                      .object({
                        id: z.number(),
                        login: z.string(),
                        email: z.string().optional(),
                        name: z.string().optional(),
                        avatar_url: z.string().optional(),
                      })
                      .optional(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const active = await GitHubAuth.getActive()
        if (!active) {
          return c.json({ authenticated: false })
        }
        return c.json({
          authenticated: true,
          user: active.user,
        })
      },
    )
    .post(
      "/callback",
      describeRoute({
        summary: "GitHub OAuth callback",
        description: "Handle the OAuth callback from GitHub after user authorization",
        operationId: "github.auth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.literal(true),
                    user: z.object({
                      id: z.number(),
                      login: z.string(),
                      email: z.string().optional(),
                      name: z.string().optional(),
                      avatar_url: z.string().optional(),
                    }),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          code: z.string().describe("OAuth authorization code from GitHub"),
          state: z.string().describe("State parameter for CSRF validation"),
        }),
      ),
      async (c) => {
        const { code, state } = c.req.valid("json")

        // Validate state parameter
        if (!oauthStates.has(state)) {
          return c.json({ error: "Invalid or expired state parameter" }, 400)
        }
        oauthStates.delete(state)

        try {
          // Exchange code for access token
          const token = await GitHubAuth.exchangeCode(code)

          // Fetch user info
          const user = await GitHubAuth.fetchUser(token)

          // Save auth data
          await GitHubAuth.save(token, user)

          log.info("GitHub auth successful", { login: user.login })

          return c.json({
            success: true as const,
            user: {
              id: user.id,
              login: user.login,
              email: user.email,
              name: user.name,
              avatar_url: user.avatar_url,
            },
          })
        } catch (err) {
          log.error("GitHub auth callback failed", { error: String(err) })
          return c.json({ error: "Authentication failed" }, 400)
        }
      },
    )
    .post(
      "/logout",
      describeRoute({
        summary: "Logout from GitHub",
        description: "Clear GitHub authentication data",
        operationId: "github.auth.logout",
        responses: {
          200: {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.literal(true) })),
              },
            },
          },
        },
      }),
      async (c) => {
        await GitHubAuth.clear()
        log.info("GitHub auth cleared")
        return c.json({ success: true as const })
      },
    ),
)
