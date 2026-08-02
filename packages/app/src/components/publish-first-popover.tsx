import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { Globe, LoaderCircle } from "lucide-solid"
import { batch, createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import {
  fetchPublishPlan,
  runPublishCheck,
  type PublishPlan,
  type PublishVisibility,
} from "@/lib/publish-client"
import { slugifyPublishName, suggestNextSlug, validatePublishSlug } from "@/lib/publish-slug"

export type PublishApiContext = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  url: string
  directory: string
  authToken: string
}

export type PublishSubmitInput = {
  slug: string
  visibility: PublishVisibility
  buildCommand: string | null
  outputDir: string
  spaFallback: boolean
}

type Props = {
  defaultSlug: string
  publishing: boolean
  getApiContext: () => PublishApiContext
  onSubmit: (input: PublishSubmitInput) => void | Promise<void>
}

const VISIBILITY_OPTIONS: PublishVisibility[] = ["public", "unlisted"]

export function PublishFirstPopover(props: Props) {
  const language = useLanguage()

  const [slugDraft, setSlugDraft] = createSignal("")
  const [slugTouched, setSlugTouched] = createSignal(false)
  const [visibility, setVisibility] = createSignal<PublishVisibility>("public")
  const [planLoading, setPlanLoading] = createSignal(false)
  const [planError, setPlanError] = createSignal<string | undefined>()
  const [inferred, setInferred] = createSignal<PublishPlan | undefined>()
  const [buildCommand, setBuildCommand] = createSignal("")
  const [outputDir, setOutputDir] = createSignal("dist")
  const [spaFallback, setSpaFallback] = createSignal(false)
  const [buildTouched, setBuildTouched] = createSignal(false)
  const [outputTouched, setOutputTouched] = createSignal(false)
  const [spaTouched, setSpaTouched] = createSignal(false)
  const [slugSuggestion, setSlugSuggestion] = createSignal<string | undefined>()
  const [check, setCheck] = createStore<{ status: "idle" | "checking" | "ok" | "fail"; reason?: string }>({
    status: "idle",
  })

  const defaultSlug = () => props.defaultSlug

  const slugValue = createMemo(() => {
    if (slugTouched()) return slugDraft()
    return slugDraft() || defaultSlug()
  })

  const slugValidation = createMemo(() => validatePublishSlug(slugValue()))

  const isStaticSite = createMemo(() => inferred()?.buildCommand === null)

  const effectiveBuildCommand = createMemo((): string | null => {
    const plan = inferred()
    if (!plan) return null
    if (plan.buildCommand === null) return null
    if (buildTouched()) return buildCommand().trim() || null
    return plan.buildCommand
  })

  const effectiveOutputDir = createMemo(() => {
    const plan = inferred()
    if (!plan) return outputDir()
    if (outputTouched()) return outputDir().trim() || plan.outputDir
    return plan.outputDir
  })

  const effectiveSpaFallback = createMemo(() => {
    const plan = inferred()
    if (!plan) return spaFallback()
    if (spaTouched()) return spaFallback()
    return plan.spaFallback
  })

  const resetForm = () => {
    batch(() => {
      setSlugTouched(false)
      setSlugDraft(defaultSlug())
      setSlugSuggestion(undefined)
      setCheck({ status: "idle" })
      setVisibility("public")
      setBuildTouched(false)
      setOutputTouched(false)
      setSpaTouched(false)
      setPlanError(undefined)
    })
  }

  const loadPlan = async () => {
    setPlanLoading(true)
    setPlanError(undefined)
    try {
      const plan = await fetchPublishPlan(props.getApiContext())
      setInferred(plan)
      setBuildCommand(plan.buildCommand ?? "")
      setOutputDir(plan.outputDir)
      setSpaFallback(plan.spaFallback)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e))
      setInferred(undefined)
    } finally {
      setPlanLoading(false)
    }
  }

  createEffect(() => {
    resetForm()
    void loadPlan()
  })

  let checkTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    const slug = slugValue().trim()
    const valid = slugValidation()
    if (checkTimer) clearTimeout(checkTimer)
    setSlugSuggestion(undefined)
    if (!valid.ok) {
      setCheck({ status: "idle" })
      return
    }
    setCheck({ status: "checking" })
    checkTimer = setTimeout(() => {
      void runPublishCheck(props.getApiContext(), slug)
        .then((result) => {
          if (result.available) {
            setCheck({ status: "ok" })
            return
          }
          const next = suggestNextSlug(slug)
          setSlugSuggestion(next)
          setCheck({ status: "fail", reason: result.reason ?? "taken" })
        })
        .catch(() => setCheck({ status: "fail", reason: "error" }))
    }, 400)
    onCleanup(() => {
      if (checkTimer) clearTimeout(checkTimer)
    })
  })

  const canPublish = createMemo(() => {
    if (!slugValidation().ok) return false
    if (props.publishing) return false
    if (planLoading() || planError()) return false
    if (!inferred()) return false
    if (check.status === "checking" || check.status === "fail") return false
    if (check.status !== "ok") return false
    if (!effectiveOutputDir().trim()) return false
    return true
  })

  const slugHint = createMemo(() => {
    const valid = slugValidation()
    if (!valid.ok) {
      switch (valid.reason) {
        case "short":
        case "long":
          return language.t("publish.slug.hint.length")
        case "hyphen":
          return language.t("publish.slug.hint.hyphen")
        case "digits":
          return language.t("publish.slug.hint.letter")
        case "invalid":
          return language.t("publish.slug.hint.charset")
        default:
          return ""
      }
    }
    if (check.status === "checking") return language.t("publish.slug.hint.checking")
    if (check.status === "ok") return language.t("publish.slug.hint.available")
    if (check.status === "fail") {
      const suggestion = slugSuggestion()
      if (check.reason === "reserved") return language.t("publish.slug.hint.reserved")
      if (suggestion) return language.t("publish.slug.hint.takenSuggestion", { slug: suggestion })
      return language.t("publish.slug.hint.taken")
    }
    return ""
  })

  const applySlugSuggestion = () => {
    const next = slugSuggestion()
    if (!next) return
    batch(() => {
      setSlugTouched(true)
      setSlugDraft(next)
      setSlugSuggestion(undefined)
    })
  }

  const submit = () => {
    const slug = slugValue().trim()
    if (!canPublish()) return
    void props.onSubmit({
      slug,
      visibility: visibility(),
      buildCommand: effectiveBuildCommand(),
      outputDir: effectiveOutputDir(),
      spaFallback: effectiveSpaFallback(),
    })
  }

  return (
    <div class="preview-publish-popover-inner">
      <div class="preview-publish-popover-title">{language.t("publish.popover.title")}</div>
      <p class="preview-publish-popover-desc">{language.t("publish.popover.description")}</p>

      <TextField
        label={language.t("publish.slug.label")}
        value={slugValue()}
        onChange={(value) => {
          setSlugTouched(true)
          setSlugDraft(value)
        }}
        description={slugHint()}
        class="w-full"
      />
      <Show when={slugSuggestion() && check.status === "fail"}>
        <button type="button" class="preview-publish-suggest-btn" onClick={applySlugSuggestion}>
          {language.t("publish.slug.useSuggestion", { slug: slugSuggestion()! })}
        </button>
      </Show>
      <div class="preview-publish-popover-url">
        <Globe class="size-3.5 shrink-0 text-text-weaker" />
        <span class="truncate text-12-regular text-text-weak">
          {slugValue().trim() || defaultSlug()}.studio.trellis.computer
        </span>
      </div>

      <div class="preview-publish-section">
        <div class="preview-publish-section-label">{language.t("publish.plan.section")}</div>
        <Show when={planLoading()}>
          <div class="preview-publish-plan-loading">
            <LoaderCircle class="preview-publish-spinner" />
            <span>{language.t("publish.plan.loading")}</span>
          </div>
        </Show>
        <Show when={planError()}>
          <p class="preview-publish-plan-error">{planError()}</p>
          <Button size="small" variant="secondary" onClick={() => void loadPlan()}>
            {language.t("publish.plan.retry")}
          </Button>
        </Show>
        <Show when={!planLoading() && !planError() && inferred()}>
          <Show
            when={isStaticSite()}
            fallback={
              <TextField
                label={language.t("publish.plan.buildCommand")}
                value={buildTouched() ? buildCommand() : (inferred()?.buildCommand ?? "")}
                onChange={(value) => {
                  setBuildTouched(true)
                  setBuildCommand(value)
                }}
                class="w-full"
              />
            }
          >
            <p class="preview-publish-plan-static">{language.t("publish.plan.static")}</p>
          </Show>
          <TextField
            label={language.t("publish.plan.outputDir")}
            value={outputTouched() ? outputDir() : (inferred()?.outputDir ?? "")}
            onChange={(value) => {
              setOutputTouched(true)
              setOutputDir(value)
            }}
            class="w-full"
          />
          <Checkbox
            checked={effectiveSpaFallback()}
            onChange={(checked) => {
              setSpaTouched(true)
              setSpaFallback(checked)
            }}
          >
            {language.t("publish.plan.spaFallback")}
          </Checkbox>
        </Show>
      </div>

      <div class="preview-publish-section">
        <div class="preview-publish-section-label">{language.t("publish.visibility.label")}</div>
        <Select
          options={VISIBILITY_OPTIONS}
          current={visibility()}
          value={(v) => v}
          label={(v) =>
            language.t(v === "public" ? "publish.visibility.public" : "publish.visibility.unlisted")
          }
          onSelect={(v) => {
            if (v) setVisibility(v)
          }}
          class="w-full"
        />
        <p class="preview-publish-visibility-hint">
          {visibility() === "public"
            ? language.t("publish.visibility.publicHint")
            : language.t("publish.visibility.unlistedHint")}
        </p>
      </div>

      <Button
        size="large"
        variant="primary"
        class="w-full"
        disabled={!canPublish()}
        onClick={submit}
      >
        {props.publishing ? language.t("publish.action.publishing") : language.t("publish.action.publishNow")}
      </Button>
    </div>
  )
}
