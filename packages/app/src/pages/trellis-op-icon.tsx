import { Icon } from "@opencode-ai/ui/icon"

const OP_ICONS: Record<string, string> = {
  "vcs:fileAdd": "file",
  "vcs:fileModify": "file",
  "vcs:fileDelete": "file",
  "vcs:fileRename": "file",
  "vcs:branchCreate": "git-branch",
  "vcs:branchDelete": "git-branch",
  "vcs:milestoneCreate": "milestone",
  "vcs:checkpointCreate": "checklist",
  "vcs:issueCreate": "issue",
  "vcs:issueUpdate": "issue",
  "vcs:issueStart": "enter",
  "vcs:issuePause": "stop",
  "vcs:issueResume": "enter",
  "vcs:issueClose": "check-small",
  "vcs:issueReopen": "arrow-right",
  "vcs:decisionRecord": "brain",
}

const OP_COLORS: Record<string, string> = {
  "vcs:fileAdd": "text-success-base",
  "vcs:fileModify": "text-warning-base",
  "vcs:fileDelete": "text-danger-base",
  "vcs:fileRename": "text-info-base",
  "vcs:branchCreate": "text-info-base",
  "vcs:branchDelete": "text-danger-base",
  "vcs:milestoneCreate": "text-accent-base",
  "vcs:checkpointCreate": "text-accent-base",
  "vcs:issueCreate": "text-info-base",
  "vcs:issueUpdate": "text-warning-base",
  "vcs:issueStart": "text-success-base",
  "vcs:issuePause": "text-warning-base",
  "vcs:issueResume": "text-success-base",
  "vcs:issueClose": "text-success-base",
  "vcs:issueReopen": "text-info-base",
  "vcs:decisionRecord": "text-accent-base",
}

function kindLabel(kind: string) {
  return kind
    .replace("vcs:", "")
    .replace(/([A-Z])/g, " $1")
    .trim()
}

export function TrellisOpBadge(props: { kind: string; class?: string }) {
  return (
    <div class={`flex items-center gap-2 ${props.class ?? ""}`} title={kindLabel(props.kind)}>
      <div class={`shrink-0 ${OP_COLORS[props.kind] ?? "text-icon-weak"}`}>
        <Icon name={(OP_ICONS[props.kind] ?? "dot") as any} size="small" />
      </div>
      <div class="text-12-medium text-text-strong">{kindLabel(props.kind)}</div>
    </div>
  )
}
