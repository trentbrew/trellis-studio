import "@/index.css"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { File } from "@opencode-ai/ui/file"
import { Font } from "@opencode-ai/ui/font"
import { Splash } from "@opencode-ai/ui/logo"
import { DEFAULT_THEME_ID, ThemeProvider, useTheme } from "@opencode-ai/ui/theme"
import { MetaProvider } from "@solidjs/meta"
import { type BaseRouterProps, Navigate, Route, Router } from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { type Duration, Effect } from "effect"
import {
  type Component,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  type JSX,
  lazy,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  Suspense,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import { CommandProvider } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { FocusProvider } from "@/context/focus"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { CloudProviderSync } from "@/context/cloud-provider-sync"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { PromptProvider } from "@/context/prompt"
import { ServerConnection, ServerProvider, serverName, useServer } from "@/context/server"
import { SettingsProvider } from "@/context/settings"
import { TerminalProvider } from "@/context/terminal"
import { AgentBackendProvider } from "@/context/agent-backend"
import { AuthProvider } from "@/context/auth"
import { NotificationsProvider } from "@/context/notifications"
import { DragDropProvider } from "@/context/drag-drop"
import { isCloudMode, notifyCloudColorMode } from "@/lib/cloud-mode"
import { installFocusDebug, installInputFocusLog } from "@/lib/focus-debug"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { useCheckServerHealth } from "./utils/server-health"
import { AppDragOverlay } from "@/components/app-drag-overlay"

const HomeRoute = lazy(() => import("@/pages/home"))
const AuthCallback = lazy(() => import("@/pages/auth-callback"))
const loadSession = () => import("@/pages/session")
const Session = lazy(loadSession)
const TrellisBadgeDemo = lazy(() => import("@/pages/trellis-badge-demo"))
const DockviewTest = lazy(() => import("@/pages/dockview-test"))
const Loading = () => <div class="size-full" />

if (typeof location === "object" && /\/session(?:\/|$)/.test(location.pathname)) {
  void loadSession()
}

const SessionRoute = () => (
  <SessionProviders>
    <Session />
  </SessionProviders>
)

const SessionIndexRoute = () => <Navigate href="session" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      wsl?: boolean
    }
    api?: {
      setTitlebar?: (theme: { mode: "light" | "dark" }) => Promise<void>
    }
  }
}

function QueryProvider(props: ParentProps) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <NotificationsProvider>
              <ModelsProvider>
                <CommandProvider>
                  <HighlightsProvider>
                    <Layout>{props.children}</Layout>
                  </HighlightsProvider>
                </CommandProvider>
              </ModelsProvider>
            </NotificationsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}

function SessionProviders(props: ParentProps) {
  return (
    <AgentBackendProvider>
      <TerminalProvider>
        <FileProvider>
          <FocusProvider>
            <PromptProvider>
              <CommentsProvider>{props.children}</CommentsProvider>
            </PromptProvider>
          </FocusProvider>
        </FileProvider>
      </TerminalProvider>
    </AgentBackendProvider>
  )
}

function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  return (
    <AppShellProviders>
      <Suspense fallback={<Loading />}>
        {props.appChildren}
        {props.children}
      </Suspense>
    </AppShellProviders>
  )
}

function CloudThemeBridge() {
  const theme = useTheme()
  onMount(() => {
    if (!isCloudMode()) return
    theme.setTheme(DEFAULT_THEME_ID)
  })
  return null
}

function FocusDebugBridge() {
  onMount(() => {
    installInputFocusLog()
    installFocusDebug()
  })
  return null
}

export function AppBaseProviders(props: ParentProps<{ locale?: Locale }>) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider
        defaultTheme={DEFAULT_THEME_ID}
        onThemeApplied={(_, mode) => {
          void window.api?.setTitlebar?.({ mode })
          notifyCloudColorMode(mode)
        }}
      >
        <CloudThemeBridge />
        <FocusDebugBridge />
        <DragDropProvider>
          <LanguageProvider locale={props.locale}>
            <UiI18nBridge>
              <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
                <QueryProvider>
                  <DialogProvider>
                    <MarkedProvider>
                      <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                    </MarkedProvider>
                  </DialogProvider>
                </QueryProvider>
              </ErrorBoundary>
            </UiI18nBridge>
          </LanguageProvider>
        </DragDropProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

const effectMinDuration =
  (duration: Duration.Input) =>
  <A, E, R>(e: Effect.Effect<A, E, R>) =>
    Effect.all([e, Effect.sleep(duration)], { concurrency: "unbounded" }).pipe(Effect.map((v) => v[0]))

function ConnectionGate(props: ParentProps<{ disableHealthCheck?: boolean }>) {
  const server = useServer()
  const checkServerHealth = useCheckServerHealth()

  const [checkMode, setCheckMode] = createSignal<"blocking" | "background">("blocking")

  // performs repeated health check with a grace period for
  // non-http connections, otherwise fails instantly
  const [startupHealthCheck, healthCheckActions] = createResource(() =>
    props.disableHealthCheck
      ? true
      : Effect.gen(function* () {
          if (!server.current) return true
          const { http, type } = server.current

          while (true) {
            const res = yield* Effect.promise(() => checkServerHealth(http))
            if (res.healthy) return true
            if (checkMode() === "background" || type === "http") return false
          }
        }).pipe(
          effectMinDuration(checkMode() === "blocking" ? "1.2 seconds" : 0),
          Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.succeed(false) }),
          Effect.ensuring(Effect.sync(() => setCheckMode("background"))),
          Effect.runPromise,
        ),
  )

  return (
    <Show
      when={checkMode() === "blocking" ? !startupHealthCheck.loading : startupHealthCheck.state !== "pending"}
      fallback={
        <div class="h-dvh w-screen flex flex-col items-center justify-center gap-6 bg-background-base">
          <Splash class="w-20 h-25 opacity-80" />
          {/* Indeterminate progress — actual duration is open-ended (health check
              retries up to 10s) so we show motion rather than progress. */}
          <div class="relative h-[2px] w-40 overflow-hidden rounded-full bg-surface-raised-base">
            <div class="app-boot-bar absolute inset-y-0 w-1/3 bg-text-strong/70" />
          </div>
          <style>{`
            @keyframes app-boot-slide {
              0%   { transform: translateX(-100%); }
              50%  { transform: translateX(160%); }
              100% { transform: translateX(-100%); }
            }
            .app-boot-bar { animation: app-boot-slide 1.6s cubic-bezier(0.45, 0, 0.2, 1) infinite; }
          `}</style>
        </div>
      }
    >
      <Show
        when={startupHealthCheck.latest}
        fallback={
          <ConnectionError
            onRetry={() => {
              if (checkMode() === "background") healthCheckActions.refetch()
            }}
            onServerSelected={(key) => {
              setCheckMode("blocking")
              server.setActive(key)
              healthCheckActions.refetch()
            }}
          />
        }
      >
        {props.children}
      </Show>
    </Show>
  )
}

function ConnectionError(props: { onRetry?: () => void; onServerSelected?: (key: ServerConnection.Key) => void }) {
  const language = useLanguage()
  const server = useServer()
  const others = () => server.list.filter((s) => ServerConnection.key(s) !== server.key)
  const name = createMemo(() => server.name || server.key)
  const serverToken = "\u0000server\u0000"
  const unreachable = createMemo(() => language.t("app.server.unreachable", { server: serverToken }).split(serverToken))

  const timer = setInterval(() => props.onRetry?.(), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base gap-6 p-6">
      <div class="flex flex-col items-center max-w-md text-center">
        <Splash class="w-12 h-15 mb-4" />
        <p class="text-14-regular text-text-base">
          {unreachable()[0]}
          <span class="text-text-strong font-medium">{name()}</span>
          {unreachable()[1]}
        </p>
        <p class="mt-1 text-12-regular text-text-weak">{language.t("app.server.retrying")}</p>
      </div>
      <Show when={others().length > 0}>
        <div class="flex flex-col gap-2 w-full max-w-sm">
          <span class="text-12-regular text-text-base text-center">{language.t("app.server.otherServers")}</span>
          <div class="flex flex-col gap-1 bg-surface-base rounded-lg p-2">
            <For each={others()}>
              {(conn) => {
                const key = ServerConnection.key(conn)
                return (
                  <button
                    type="button"
                    class="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                    onClick={() => props.onServerSelected?.(key)}
                  >
                    <span class="text-14-regular text-text-strong truncate">{serverName(conn)}</span>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
}) {
  return (
    <ServerProvider
      defaultServer={props.defaultServer}
      disableHealthCheck={props.disableHealthCheck}
      servers={props.servers}
    >
      <ConnectionGate disableHealthCheck={props.disableHealthCheck}>
        <ServerKey>
          <GlobalSDKProvider>
            <GlobalSyncProvider>
              <CloudProviderSync />
              <AuthProvider>
                <AppDragOverlay />
                <Dynamic
                  component={props.router ?? Router}
                  root={(routerProps) => <RouterRoot appChildren={props.children}>{routerProps.children}</RouterRoot>}
                >
                  <Route path="/" component={HomeRoute} />
                  <Route path="/auth/callback" component={AuthCallback} />
                  <Route path="/trellis-badge" component={TrellisBadgeDemo} />
                  <Route path="/dockview-test" component={DockviewTest} />
                  <Route path="/:dir" component={DirectoryLayout}>
                    <Route path="/" component={SessionIndexRoute} />
                    <Route path="/session" component={SessionRoute} />
                    <Route path="/session/:id" component={SessionRoute} />
                    <Route path="/trellis" component={() => <Navigate href="..?view=graph" />} />
                  </Route>
                </Dynamic>
              </AuthProvider>
            </GlobalSyncProvider>
          </GlobalSDKProvider>
        </ServerKey>
      </ConnectionGate>
    </ServerProvider>
  )
}
