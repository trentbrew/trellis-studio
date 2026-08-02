import { createEffect, createMemo, lazy, Match, on, onCleanup, Suspense, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import type { FileSearchHandle } from "@opencode-ai/ui/file"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { cloneSelectedLineRange, previewSelectedLines } from "@opencode-ai/ui/pierre/selection-bridge"
import { createLineCommentController } from "@opencode-ai/ui/line-comment-annotations"
import { sampledChecksum } from "@opencode-ai/util/encode"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { showToast } from "@opencode-ai/ui/toast"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useComments } from "@/context/comments"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { useSync } from "@/context/sync"
import { useTrellisOptional } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { searchMentions } from "@/lib/mention-search"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { defaultEntityColor, defaultEntityIcon } from "@/lib/entity-theme"
import { formatServerError } from "@/utils/server-errors"
import { getSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"
import { FileEditor } from "./file-editor"
import { media } from "./media"

const isVideoPath = (p: string | undefined) => !!p && /\.(mp4|m4v|webm|ogv|mov|mkv|avi|flv|wmv|3gp|3g2)$/i.test(p)
const isImagePath = (p: string | undefined) => !!p && /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|apng|jxl)$/i.test(p)
const isAudioPath = (p: string | undefined) =>
  !!p && /\.(mp3|wav|ogg|oga|opus|flac|aac|m4a|weba|wma|aif|aiff|mid|midi)$/i.test(p)
const isSheetPath = (p: string | undefined) => !!p && /\.(xlsx?|xlsm)$/i.test(p)
const isWhiteboardPath = (p: string | undefined) => !!p && /\.whiteboard$/i.test(p)
const isModelPath = (p: string | undefined) => !!p && /\.(obj|mtl|gltf|glb|bin|dds)$/i.test(p)
const XlsxEditor = lazy(() => import("./xlsx-editor"))
const WhiteboardEditor = lazy(() => import("./whiteboard-editor"))
const ModelViewer = lazy(() => import("./model-viewer"))

function FileCommentMenu(props: {
  moreLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: VoidFunction
  onDelete: VoidFunction
}) {
  return (
    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu gutter={4} placement="bottom-end">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          size="small"
          class="size-6 rounded-md"
          aria-label={props.moreLabel}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={props.onEdit}>
              <DropdownMenu.ItemLabel>{props.editLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={props.onDelete}>
              <DropdownMenu.ItemLabel>{props.deleteLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  )
}

export function FileTabContent(props: { tab: string }) {
  const file = useFile()
  const sdk = useSDK()
  const comments = useComments()
  const language = useLanguage()
  const prompt = usePrompt()
  const sync = useSync()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const fileComponent = useFileComponent()
  const { sessionKey, tabs, view } = useSessionLayout()
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  }).activeFileTab

  let scroll: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let restoreFrame: number | undefined
  let pending: { x: number; y: number } | undefined
  let codeScroll: HTMLElement[] = []
  let find: FileSearchHandle | null = null

  const search = {
    register: (handle: FileSearchHandle | null) => {
      find = handle
    },
  }

  const path = createMemo(() => file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const text = createMemo(() => {
    const p = path()
    if (!p) return ""
    return file.text(p) ?? ""
  })
  const cacheKey = createMemo(() => sampledChecksum(contents()))
  const editable = createMemo(() => {
    const content = state()?.content
    return content?.type === "text" && content.encoding !== "base64"
  })
  const selectedLines = createMemo<SelectedLineRange | null>(() => {
    const p = path()
    if (!p) return null
    if (file.ready()) return (file.selectedLines(p) as SelectedLineRange | undefined) ?? null
    return (getSessionHandoff(sessionKey())?.files[p] as SelectedLineRange | undefined) ?? null
  })

  const selectionPreview = (source: string, selection: FileSelection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine,
    })
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    const selection = selectionFromLines(input.selection)
    const preview =
      input.preview ??
      (() => {
        if (input.file === path()) return selectionPreview(contents(), selection)
        const source = file.get(input.file)?.content?.content
        if (!source) return undefined
        return selectionPreview(source, selection)
      })()

    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    const preview =
      input.file === path() ? selectionPreview(contents(), selectionFromLines(input.selection)) : undefined
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? { preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    selected: null as SelectedLineRange | null,
  })

  const syncSelected = (range: SelectedLineRange | null) => {
    const p = path()
    if (!p) return
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null)
  }

  const activeSelection = () => note.selected ?? selectedLines()

  const commentsUi = createLineCommentController({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    state: {
      opened: () => note.openedComment,
      setOpened: (id) => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: (range) => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: (range) => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected,
    },
    getHoverSelectedRange: activeSelection,
    cancelDraftOnCommentToggle: true,
    clearSelectionOnSelectionEndNull: true,
    onSubmit: ({ comment, selection }) => {
      const p = path()
      if (!p) return
      addCommentToContext({ file: p, selection, comment, origin: "file" })
    },
    onUpdate: ({ id, comment, selection }) => {
      const p = path()
      if (!p) return
      updateCommentInContext({ id, file: p, selection, comment })
    },
    onDelete: (comment) => {
      const p = path()
      if (!p) return
      removeCommentFromContext({ id: comment.id, file: p })
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => (
      <FileCommentMenu
        moreLabel={language.t("common.moreOptions")}
        editLabel={language.t("common.edit")}
        deleteLabel={language.t("common.delete")}
        onEdit={controls.edit}
        onDelete={controls.remove}
      />
    ),
  })

  createEffect(() => {
    if (typeof window === "undefined") return

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeFileTab() !== props.tab) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "f") return

      event.preventDefault()
      event.stopPropagation()
      find?.focus()
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, { capture: true }))
  })

  createEffect(
    on(
      path,
      () => {
        commentsUi.note.reset()
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const focus = comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (activeFileTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    commentsUi.note.openComment(target.id, target.selection, { cancelDraft: true })
    requestAnimationFrame(() => comments.clearFocus())
  })

  const getCodeScroll = () => {
    const el = scroll
    if (!el) return []

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return []

    const root = host.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll("[data-code]")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
    )
  }

  const queueScrollUpdate = (next: { x: number; y: number }) => {
    pending = next
    if (scrollFrame !== undefined) return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined

      const out = pending
      pending = undefined
      if (!out) return

      view().setScroll(props.tab, out)
    })
  }

  const handleCodeScroll = (event: Event) => {
    const el = scroll
    if (!el) return

    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    queueScrollUpdate({
      x: target.scrollLeft,
      y: el.scrollTop,
    })
  }

  const syncCodeScroll = () => {
    const next = getCodeScroll()
    if (next.length === codeScroll.length && next.every((el, i) => el === codeScroll[i])) return

    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    codeScroll = next

    for (const item of codeScroll) {
      item.addEventListener("scroll", handleCodeScroll)
    }
  }

  const restoreScroll = () => {
    const el = scroll
    if (!el) return

    const s = view().scroll(props.tab)
    if (!s) return

    syncCodeScroll()

    if (codeScroll.length > 0) {
      for (const item of codeScroll) {
        if (item.scrollLeft !== s.x) item.scrollLeft = s.x
      }
    }

    if (el.scrollTop !== s.y) el.scrollTop = s.y
    if (codeScroll.length > 0) return
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const queueRestore = () => {
    if (restoreFrame !== undefined) return

    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined
      restoreScroll()
    })
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (codeScroll.length === 0) syncCodeScroll()

    queueScrollUpdate({
      x: codeScroll[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    })
  }

  const cancelCommenting = () => {
    const p = path()
    if (p) file.setSelectedLines(p, null)
    setNote("commenting", null)
  }

  let prev = {
    loaded: false,
    ready: false,
    active: false,
  }

  createEffect(() => {
    const loaded = !!state()?.loaded
    const ready = file.ready()
    const active = activeFileTab() === props.tab
    const restore = (loaded && !prev.loaded) || (ready && !prev.ready) || (active && loaded && !prev.active)
    prev = { loaded, ready, active }
    if (!restore) return
    queueRestore()
  })

  onCleanup(() => {
    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame)
  })

  const renderFile = (source: string) => (
    <div class="relative overflow-hidden pb-0 h-full">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        enableHoverUtility
        selectedLines={activeSelection()}
        commentedLines={commentedLines()}
        onRendered={() => {
          queueRestore()
        }}
        annotations={commentsUi.annotations()}
        renderAnnotation={commentsUi.renderAnnotation}
        renderHoverUtility={commentsUi.renderHoverUtility}
        onLineSelected={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelected(range)
        }}
        onLineNumberSelectionEnd={commentsUi.onLineNumberSelectionEnd}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelectionEnd(range)
        }}
        search={search}
        class="select-text"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          readFile: (p: string) =>
            sdk.client.file
              .read({ path: p })
              .then((x) => x.data)
              .catch(() => undefined),
          onLoad: queueRestore,
          onError: (args: { kind: "image" | "audio" | "svg" | "pdf" | "font" }) => {
            if (args.kind !== "svg") return
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title"),
            })
          },
        }}
      />
    </div>
  )

  const save = () => {
    const p = path()
    if (!p) return
    void file.save(p).catch((err) => {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: formatServerError(err, language.t),
      })
    })
  }

  return (
    <Tabs.Content value={props.tab} class="mt-0 relative h-full">
      <Switch>
        <Match when={state()?.loaded && isSheetPath(path()) && path()}>
          {(p) => (
            <Suspense fallback={<div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>}>
              <XlsxEditor path={p()} active={activeFileTab() === props.tab} />
            </Suspense>
          )}
        </Match>
        <Match when={state()?.loaded && isWhiteboardPath(path()) && path()}>
          {(p) => (
            <Suspense fallback={<div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>}>
              <WhiteboardEditor path={p()} active={activeFileTab() === props.tab} />
            </Suspense>
          )}
        </Match>
        <Match when={state()?.loaded && isModelPath(path()) && path()}>
          {(p) => (
            <Suspense fallback={<div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>}>
              <ModelViewer path={p()} active={activeFileTab() === props.tab} />
            </Suspense>
          )}
        </Match>
        <Match when={state()?.loaded && editable() && path()}>
          {(p) => (
            <FileEditor
              path={p()}
              state={state()!}
              value={text()}
              active={activeFileTab() === props.tab}
              onChange={(value) => file.setDraft(p(), value)}
              onSave={save}
              onMode={(value) => file.setMode(p(), value)}
              mention={{
                search: (query) =>
                  searchMentions({ query, file, sync, trellis: mentionTrellisCtx(trellis, trellisStore?.facts) }),
                fetch: async (id, type) => {
                  if (type !== "file") return undefined
                  await file.load(id)
                  return file.text(id)
                },
                navigate: (attrs) => {
                  if (attrs.type === "file") {
                    const t = file.tab(attrs.id)
                    file.load(attrs.id)
                    tabs().open(t)
                    tabs().setActive(t)
                  }
                },
                onCreate: async (rel) => {
                  try {
                    await sdk.client.file.write({ fileWriteInput: { path: rel, content: "", format: false } })
                    const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
                    await file.tree.refresh(parent)
                    if (parent) file.tree.expand(parent)
                    showToast({ variant: "success", title: `Created ${rel}` })
                    return rel
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    showToast({ variant: "error", title: "Create failed", description: msg })
                    return undefined
                  }
                },
                onCreateEntity: async (opts) => {
                  try {
                    const slug = opts.name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                    const id = `${opts.type.toLowerCase()}:${slug}`
                    const dir = sdk.directory
                    const url = sdk.url
                    const res = await sdk.fetch(`${url}/trellis/store/assert?directory=${encodeURIComponent(dir)}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        facts: [
                          { e: id, a: "type", v: opts.type },
                          { e: id, a: "name", v: opts.name },
                          { e: id, a: "color", v: defaultEntityColor(opts.type) },
                          { e: id, a: "icon", v: defaultEntityIcon(opts.type) },
                        ],
                      }),
                    })
                    if (!res.ok) throw new Error(`Store assert failed: ${res.status}`)
                    window.dispatchEvent(new CustomEvent("trellis-store-changed", { detail: { quiet: true } }))
                    showToast({ variant: "success", title: `Created ${opts.type}: ${opts.name}` })
                    return id
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    showToast({ variant: "error", title: "Entity create failed", description: msg })
                    return undefined
                  }
                },
              }}
            />
          )}
        </Match>
        <Match when={state()?.loaded && isVideoPath(path())}>
          <div class="h-full min-h-0 flex items-center justify-center bg-black">
            <video src={media(sdk.url, path()!, sdk.directory)} controls class="max-h-full max-w-full" />
          </div>
        </Match>
        <Match when={state()?.loaded && isAudioPath(path())}>
          <div class="h-full min-h-0 flex items-center justify-center bg-background-stronger px-6">
            <audio src={media(sdk.url, path()!, sdk.directory)} controls preload="metadata" class="w-full max-w-xl" />
          </div>
        </Match>
        <Match when={state()?.loaded && isImagePath(path())}>
          <div class="h-full min-h-0 flex items-center justify-center bg-background-stronger overflow-auto p-4">
            <img
              src={media(sdk.url, path()!, sdk.directory)}
              alt={path()}
              class="max-h-full max-w-full object-contain"
            />
          </div>
        </Match>
        <Match when={state()?.loaded}>
          <ScrollView
            class="h-full"
            viewportRef={(el: HTMLDivElement) => {
              scroll = el
              restoreScroll()
            }}
            onScroll={handleScroll as any}
          >
            {renderFile(contents())}
          </ScrollView>
        </Match>
        <Match when={state()?.loading}>
          <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
        </Match>
        <Match when={state()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
      </Switch>
    </Tabs.Content>
  )
}
