export type FocusSurface =
  | "whiteboard"
  | "file"
  | "review"
  | "cms"
  | "graph"
  | "projection"
  | "preview"
  | "plan"
  | "design"
  | "assets"
  | "terminal"
  | "shell"

export type FocusLanePayload = {
  id: string
  parentLaneId?: string
  forkKind?: "sibling" | "child"
  issueId?: string
  virtualBaseOpHash?: string
  unpromotedParent?: boolean
}

export type FocusContext = {
  version: 1
  surface: FocusSurface
  label: string
  key: string
  summary?: string
  payload: Record<string, unknown> & { lane?: FocusLanePayload }
  capturedAt: string
  pinned?: boolean
  excluded?: boolean
}

export type FocusSessionRef = {
  id: string
  laneID?: string
  parentLaneID?: string
  laneForkKind?: "sibling" | "child"
  laneUnpromotedParent?: boolean
}
