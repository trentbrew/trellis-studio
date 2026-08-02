import path from "path"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { Instance } from "@/project/instance"
import {
  analyze as analyzeCore,
  image as imageCore,
  kind as kindCore,
  resetCache,
  supported as supportedCore,
  text as textCore,
  type AnalyzeOptions,
  type Input as CoreInput,
  type Kind as CoreKind,
  type LocalFn,
  type Result as CoreResult,
  type Source as CoreSource,
} from "@opencode-ai/media-analysis"

export namespace MediaAnalysis {
  export type Result = CoreResult
  export type Input = CoreInput
  export type Kind = CoreKind
  export type Source = CoreSource
  type Fetch = (url: string, init?: RequestInit) => Promise<Response>

  const state: {
    fetch: Fetch
    local?: LocalFn
  } = {
    fetch,
  }

  export function configure(input: { fetch?: Fetch; local?: LocalFn }) {
    if (input.fetch) state.fetch = input.fetch
    if (input.local) state.local = input.local
  }

  export function reset() {
    state.fetch = fetch
    state.local = undefined
    resetCache()
  }

  export function image(mime: string) {
    return imageCore(mime)
  }

  export function kind(mime: string) {
    return kindCore(mime)
  }

  export function supported(mime: string) {
    return supportedCore(mime)
  }

  export function text(input: { filename?: string; result: Result }) {
    return textCore(input)
  }

  function dirs() {
    const result: string[] = []
    try {
      result.push(Instance.directory)
    } catch {}
    result.push(process.cwd())
    return result
  }

  export async function analyze(input: Input): Promise<Result> {
    const cfg = await Config.get().catch(() => ({}) as Config.Info)
    const opts = cfg.media_analysis?.image as AnalyzeOptions | undefined
    return analyzeCore(input, {
      ...opts,
      disable_dotenv: Env.get("OPENCODE_DISABLE_DOTENV") === "1",
      dirs: dirs(),
      fetch: state.fetch,
      local: state.local,
    })
  }
}
