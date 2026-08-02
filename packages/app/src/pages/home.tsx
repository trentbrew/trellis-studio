import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js"
import { animate } from "motion"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogCreateProject } from "@/components/dialog-create-project"
import { DialogCreateFromTemplate } from "@/components/dialog-create-from-template"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { TextField } from "@opencode-ai/ui/text-field"
import { Logo } from "@opencode-ai/ui/logo"
import { useAuth } from "@/context/auth"

function getFilename(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path
}

function hashColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 40%, 25%)`
}

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const auth = useAuth()
  const [input, setInput] = createSignal("")
  const homedir = createMemo(() => sync.data.path.home)
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  })

  // Restore pending prompt from auth redirect
  onMount(() => {
    const pending = auth.pendingPrompt()
    if (pending) {
      setInput(pending)
      auth.clearPendingPrompt()
    }
  })

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory)
        }
      } else if (result) {
        openProject(result)
      }
    }

    dialog.show(
      () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
      () => resolve(null),
    )
  }

  function requireAuth(action: () => void) {
    if (auth.isAuthRequired() && !auth.isAuthenticated()) {
      auth.login(input())
      return
    }
    action()
  }

  async function handleInputSubmit(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const value = input().trim()
      if (value) {
        requireAuth(() => {
          if (recent().length > 0) {
            openProject(recent()[0].worktree)
          } else {
            chooseProject()
          }
        })
      }
    }
  }

  function handleActionClick(action: string) {
    switch (action) {
      case "new":
        requireAuth(() => {
          dialog.show(
            () => (
              <DialogCreateProject
                onSelect={(result) => {
                  if (Array.isArray(result)) {
                    for (const directory of result) {
                      openProject(directory)
                    }
                  } else if (result) {
                    openProject(result)
                  }
                }}
              />
            ),
            () => {},
          )
        })
        break
      case "open":
        requireAuth(() => chooseProject())
        break
      case "clone":
        requireAuth(() => {
          // Placeholder for git clone
        })
        break
      case "template":
        requireAuth(() => {
          dialog.show(
            () => (
              <DialogCreateFromTemplate
                onSelect={(directory) => {
                  if (directory) openProject(directory)
                }}
              />
            ),
            () => {},
          )
        })
        break
    }
  }

  return (
    <div
      class="flex flex-col min-h-[calc(100vh-80px)] w-full"
      ref={(el) =>
        requestAnimationFrame(() =>
          animate(el as Element, { opacity: [0, 1], y: [4, 0] }, {
            type: "spring",
            stiffness: 400,
            damping: 30,
          } as any),
        )
      }
    >
      {/* Main content */}
      <div class="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <div class="w-full max-w-2xl flex flex-col items-center gap-8">
          <Logo class="mx-auto" />

          {/* Auth status */}
          <div class="flex flex-col items-center gap-2">
            <Show when={auth.isAuthRequired() && auth.isAuthenticated()}>
              <div class="flex items-center gap-2 text-12-regular text-text-weak">
                <div class="size-1.5 rounded-full bg-icon-success-base" />
                {auth.user()?.email}
                <button
                  class="text-text-weak hover:text-text-base transition-colors ml-1"
                  onClick={() => auth.logout()}
                >
                  Sign out
                </button>
              </div>
            </Show>
          </div>

          {/* Main input */}
          <div class="w-full">
            <div class="relative">
              <TextField
                multiline
                value={input()}
                onChange={setInput}
                onKeyDown={handleInputSubmit}
                placeholder="Make anything..."
                class="w-full min-h-[120px] p-4 pr-12 text-16-regular bg-surface-base border border-border-weak-base rounded-12 resize-none focus:outline-none focus:border-border-strong-base transition-colors"
              />
              <button
                class="absolute bottom-3 right-3 p-2 text-text-weak hover:text-text-base transition-colors"
                onClick={() => {
                  const value = input().trim()
                  if (value) {
                    requireAuth(() => {
                      if (recent().length > 0) {
                        openProject(recent()[0].worktree)
                      } else {
                        chooseProject()
                      }
                    })
                  }
                }}
              >
                <Icon name="arrow-up" size="small" />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="normal"
              icon="plus"
              class="text-12-regular"
              onClick={() => handleActionClick("new")}
            >
              New project
            </Button>
            <Button
              variant="ghost"
              size="normal"
              icon="folder-add-left"
              class="text-12-regular"
              onClick={() => handleActionClick("open")}
            >
              Open local dir
            </Button>
            <Button
              variant="ghost"
              size="normal"
              icon="github"
              class="text-12-regular"
              onClick={() => handleActionClick("clone")}
            >
              Clone git repo
            </Button>
            <Button
              variant="ghost"
              size="normal"
              icon="fork"
              class="text-12-regular"
              onClick={() => handleActionClick("template")}
            >
              Start with template
            </Button>
          </div>
        </div>
      </div>

      {/* Recent projects grid */}
      <Show when={recent().length > 0}>
        <div class="w-full max-w-5xl mx-auto px-6 pb-8">
          <div class="text-12-medium text-text-weak mb-4">{language.t("home.recentProjects")}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <For each={recent()}>
              {(project) => {
                const name = createMemo(() => getFilename(project.worktree))
                return (
                  <button
                    class="flex flex-col rounded-10 border border-border-weak-base overflow-hidden hover:border-border-strong-base transition-colors text-left group"
                    onClick={() => openProject(project.worktree)}
                  >
                    {/* Thumbnail placeholder */}
                    <div
                      class="h-28 w-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${hashColor(name())}, ${hashColor(name() + "x")})`,
                      }}
                    >
                      <span class="text-20-medium text-white/60 select-none">{name().charAt(0).toUpperCase()}</span>
                    </div>
                    {/* Info */}
                    <div class="px-3 py-2.5 flex flex-col gap-0.5">
                      <span class="text-13-medium text-text-base truncate group-hover:text-text-strong transition-colors">
                        {name()}
                      </span>
                      <span class="text-11-regular text-text-weak">
                        {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                      </span>
                    </div>
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
