import { createContext, useContext, createEffect, createMemo, onMount, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createClient } from "@openauthjs/openauth/client"
import { persisted, Persist } from "@/utils/persist"
import { useServer } from "@/context/server"

const AUTH_CALLBACK_PATH = "/auth/callback"
const PENDING_PROMPT_KEY = "auth.pendingPrompt"
const PKCE_VERIFIER_KEY = "auth.pkceVerifier"

type AuthState = {
  access: string
  refresh: string
  expires: number
  accountID: string
  email: string
}

type AuthStore = {
  ready: boolean
  state?: AuthState
}

function createAuthClient() {
  const url = import.meta.env.VITE_AUTH_URL
  if (!url) return undefined
  return createClient({
    clientID: "trellis-app",
    issuer: url,
  })
}

function callbackUrl() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return {}
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

type AuthContextValue = {
  user: () => { accountID: string; email: string } | undefined
  isAuthenticated: () => boolean
  isAuthRequired: () => boolean
  token: () => string | undefined
  login: (pendingPrompt?: string) => Promise<void>
  logout: () => void
  handleCallback: (code: string) => Promise<string | undefined>
  pendingPrompt: () => string | undefined
  clearPendingPrompt: () => void
  ready: () => boolean
}

const AuthContext = createContext<AuthContextValue>()

export function AuthProvider(props: { children: JSX.Element }) {
  const server = useServer()
  const client = createAuthClient()

  const [store, set] = persisted(
    Persist.global("auth.state"),
    createStore<AuthStore>({
      ready: false,
    }),
  )

  onMount(() => {
    set("ready", true)
    if (store.state && store.state.expires < Date.now() && client) {
      refreshToken()
    }
  })

  async function refreshToken() {
    if (!client || !store.state?.refresh) return
    try {
      const result = await client.refresh(store.state.refresh, {
        access: store.state.access,
      })
      if (result.err) {
        set("state", undefined)
        return
      }
      if (result.tokens) {
        set("state", {
          ...store.state!,
          access: result.tokens.access,
          refresh: result.tokens.refresh,
          expires: Date.now() + 3600 * 1000,
        })
      }
    } catch {
      set("state", undefined)
    }
  }

  const user = createMemo(() => {
    if (!store.state) return undefined
    return { accountID: store.state.accountID, email: store.state.email }
  })

  const isAuthenticated = createMemo(() => !!store.state)

  const isAuthRequired = createMemo(() => {
    if (!client) return false
    return !server.isLocal()
  })

  const token = createMemo(() => {
    if (!store.state) return undefined
    if (store.state.expires < Date.now()) {
      refreshToken()
      return store.state.access
    }
    return store.state.access
  })

  async function login(pendingPrompt?: string) {
    if (!client) return
    if (pendingPrompt) {
      localStorage.setItem(PENDING_PROMPT_KEY, pendingPrompt)
    }
    const { challenge, url } = await client.authorize(callbackUrl(), "code", {
      pkce: true,
      provider: "github",
    })
    if (challenge.verifier) {
      localStorage.setItem(PKCE_VERIFIER_KEY, challenge.verifier)
    }
    window.location.href = url
  }

  function logout() {
    set("state", undefined)
    localStorage.removeItem(PENDING_PROMPT_KEY)
  }

  async function handleCallback(code: string): Promise<string | undefined> {
    if (!client) return undefined
    const verifier = localStorage.getItem(PKCE_VERIFIER_KEY) ?? undefined
    localStorage.removeItem(PKCE_VERIFIER_KEY)
    const result = await client.exchange(code, callbackUrl(), verifier)
    if (result.err) {
      console.error("Auth exchange failed:", result.err)
      return undefined
    }
    const payload = decodeJwtPayload(result.tokens.access)
    const subject = payload.sub as Record<string, unknown> | undefined
    const properties = (subject as any)?.properties ?? payload
    set("state", {
      access: result.tokens.access,
      refresh: result.tokens.refresh,
      expires: Date.now() + 3600 * 1000,
      accountID: (properties.accountID as string) ?? "",
      email: (properties.email as string) ?? "",
    })
    return pendingPrompt()
  }

  function pendingPrompt() {
    return localStorage.getItem(PENDING_PROMPT_KEY) ?? undefined
  }

  function clearPendingPrompt() {
    localStorage.removeItem(PENDING_PROMPT_KEY)
  }

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isAuthRequired,
    token,
    login,
    logout,
    handleCallback,
    pendingPrompt,
    clearPendingPrompt,
    ready: () => store.ready,
  }

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export function useAuthOptional() {
  return useContext(AuthContext)
}
