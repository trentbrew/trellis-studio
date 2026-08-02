type WarmSessionTabInput = {
  directory: string
  sessionID: string
  laneActivate: (input: { sessionID: string; directory: string }) => Promise<unknown>
  syncSession: (sessionID: string) => Promise<unknown>
}

/** Pre-activate Trellis lane and prefetch session state before the tab route settles. */
export function warmSessionTab(input: WarmSessionTabInput) {
  void input.syncSession(input.sessionID)
  void input.laneActivate({ sessionID: input.sessionID, directory: input.directory }).catch(() => {})
}
