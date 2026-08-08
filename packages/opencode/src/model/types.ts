export type Trust = "fast" | "full"

export type State = "ready" | "loading" | "error" | "disconnected"

export type Status = {
  state: State
  load: number
  ram: number
  sessions: number
  /** Weights confirmed resident, so the next request skips the load cost. */
  warm: boolean
  error?: string
}

export type Config = {
  /** Cap on visible answer tokens. Reasoning is budgeted separately via `think`. */
  max: number
  temp: number
  topk?: number
  topp?: number
  seed?: number
  stop?: string[]
  /**
   * Reasoning budget for thinking models. Ollama counts reasoning against
   * num_predict, so a shared cap lets thinking starve the answer entirely.
   */
  think?: number
}

export type Message = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
}

export type Delta = {
  text: string
  first: boolean
  done: boolean
  index: number
  /**
   * Reasoning output from a thinking model. Rendered as transient status rather
   * than appended to the answer — it can outnumber content tokens 40:1.
   */
  thinking?: boolean
}

export type Request = {
  session: string
  messages: Message[]
  config: Config
  trust: Trust
}

export type Caps = {
  context: number
  output: number
  streaming: boolean
  reuse: boolean
  trust: Trust[]
  memory: number
}

export type Provider = {
  readonly id: string
  readonly endpoint: string
  init(): Promise<Status>
  /**
   * Force the weights resident and hold them there. Backends that evict on idle
   * need this to keep time-to-first-token low; ones that pin at startup no-op.
   */
  warm(): Promise<Status>
  shutdown(): Promise<void>
  status(): Status
  generate(req: Request): AsyncIterable<Delta>
  reset(session: string): Promise<void>
}

export type Adapter = {
  id: string
  name: string
  platform: string
  endpoint: string
  caps: Caps
  probe(endpoint?: string): Promise<boolean>
  create(endpoint?: string): Provider
}

export type Info = {
  id: string
  name: string
  platform: string
  endpoint: string
  available: boolean
}
