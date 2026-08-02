import { For } from "solid-js"
import { TrellisOpBadge } from "./trellis-op-icon"

const kinds = [
  "vcs:fileAdd",
  "vcs:fileModify",
  "vcs:fileDelete",
  "vcs:fileRename",
  "vcs:branchCreate",
  "vcs:branchDelete",
  "vcs:milestoneCreate",
  "vcs:checkpointCreate",
  "vcs:issueCreate",
  "vcs:issueUpdate",
  "vcs:issueStart",
  "vcs:issuePause",
  "vcs:issueResume",
  "vcs:issueClose",
  "vcs:issueReopen",
  "vcs:decisionRecord",
]

export default function TrellisBadgeDemo() {
  return (
    <div class="min-h-dvh bg-background-base text-text-base flex items-center justify-center p-8">
      <div class="w-full max-w-4xl rounded-16 border border-border-weaker-base bg-surface-base p-8 shadow-lg">
        <div class="mb-6 flex flex-col gap-2">
          <div class="text-14-medium text-text-strong">Trellis op badge preview</div>
          <div class="text-12-regular text-text-weak">
            Isolated route for testing the symbol and color mapping before we commit to it.
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={kinds}>
            {(kind) => (
              <div class="rounded-12 border border-border-weaker-base bg-background-stronger/40 p-3">
                <TrellisOpBadge kind={kind} />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
