import path from "path"
import { Schema } from "effect"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"

const log = Log.create({ service: "github-auth" })
const authFile = path.join(Global.Path.data, "github-auth.json")

// Environment configuration
const env = {
  clientId: process.env.GITHUB_CLIENT_ID || "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  appName: process.env.GITHUB_APP_NAME || "",
  callbackUrl: process.env.GITHUB_CALLBACK_URL || "",
  privateKey: process.env.GITHUB_PRIVATE_KEY || "",
}

// Schemas
export class GitHubUser extends Schema.Class<GitHubUser>("GitHubUser")({
  id: Schema.Number,
  login: Schema.String,
  email: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  avatar_url: Schema.optional(Schema.String),
}) {}

export type GitHubUserType = Schema.Schema.Type<typeof GitHubUser>

// State management
interface AuthState {
  accessToken?: string
  user?: GitHubUserType
  lastVerified?: number
}

const state: AuthState = {}

// Load on module init
async function init() {
  try {
    const data = await Filesystem.readJson<{
      accessToken?: string
      user?: GitHubUserType
      lastVerified?: number
    }>(authFile)
    if (data.accessToken && data.user) {
      state.accessToken = data.accessToken
      state.user = data.user
      state.lastVerified = data.lastVerified
    }
  } catch {
    // No saved auth
  }
}

void init()

export namespace GitHubAuth {
  export function isConfigured(): boolean {
    return !!(env.clientId && env.clientSecret && env.callbackUrl)
  }

  export function getAuthorizeUrl(stateParam: string): string {
    const params = new URLSearchParams({
      client_id: env.clientId,
      redirect_uri: env.callbackUrl,
      scope: "read:user user:email",
      state: stateParam,
    })
    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  export async function exchangeCode(code: string): Promise<string> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: env.callbackUrl,
      }),
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`)
    }

    const data = (await response.json()) as { access_token?: string; error?: string }

    if (data.error || !data.access_token) {
      throw new Error(data.error || "No access token received")
    }

    return data.access_token
  }

  export async function fetchUser(token: string): Promise<GitHubUserType> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": env.appName || "opencode",
      },
    })

    if (!response.ok) {
      throw new Error(`User fetch failed: ${response.status}`)
    }

    const data = await response.json()
    const decode = Schema.decodeUnknownSync(GitHubUser)
    return decode(data)
  }

  export async function save(token: string, user: GitHubUserType): Promise<void> {
    await Filesystem.writeJson(authFile, { accessToken: token, user, lastVerified: Date.now() }, 0o600)
    state.accessToken = token
    state.user = user
    state.lastVerified = Date.now()
  }

  export async function load(): Promise<{ token?: string; user?: GitHubUserType }> {
    try {
      const data = await Filesystem.readJson<{
        accessToken?: string
        user?: GitHubUserType
        lastVerified?: number
      }>(authFile)
      if (data.accessToken && data.user) {
        state.accessToken = data.accessToken
        state.user = data.user
        state.lastVerified = data.lastVerified
      }
      return { token: data.accessToken, user: data.user }
    } catch {
      return {}
    }
  }

  export async function clear(): Promise<void> {
    await Filesystem.writeJson(authFile, {}, 0o600)
    delete state.accessToken
    delete state.user
    delete state.lastVerified
  }

  export function getActive(): { token: string; user: GitHubUserType } | undefined {
    if (state.accessToken && state.user) {
      return { token: state.accessToken, user: state.user }
    }
    return undefined
  }

  export function getAgentId(): string | undefined {
    return state.user?.login
  }
}
