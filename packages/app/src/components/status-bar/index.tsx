import { ConnectionSegment } from "./segments/connection-segment"
import { ContextSeparator } from "./segments/context-segment"
import { ActiveIssueSegment } from "./segments/active-issue-segment"
import { UserSegment } from "./segments/user-segment"
import { IssueCountSegment } from "./segments/issue-count-segment"
import { MilestoneSegment } from "./segments/milestone-segment"
import { CycleSegment } from "./segments/cycle-segment"
import { ActiveFileSegment } from "./segments/active-file-segment"
import { StatsSegment } from "./segments/stats-segment"
import { StatusSegment } from "./segments/status-segment"
import { NotificationSegment } from "./segments/notification-segment"
import { VersionSegment } from "./segments/version-segment"
import { SandboxSegment } from "./segments/sandbox-segment"

export function StatusBar() {
  return (
    <div class="shrink-0 h-[36px] flex flex-row flex-nowrap items-center px-3 gap-2 text-[12px] select-none overflow-hidden rounded-xl bg-background-base/50">
      {/* Left zone */}
      <div class="flex flex-row flex-nowrap items-center gap-1">
        <VersionSegment />
        <UserSegment />
        <IssueCountSegment />
        <MilestoneSegment />
        <CycleSegment />
        <StatsSegment />
        <ConnectionSegment />
        <SandboxSegment />
        <ContextSeparator />
        <ActiveIssueSegment />
        <ActiveFileSegment />
      </div>

      <div class="flex-1 min-w-0" />

      {/* Right zone */}
      <div class="flex flex-row flex-nowrap items-center gap-2.5 shrink-0">
        <StatusSegment />
        <NotificationSegment />
      </div>
    </div>
  )
}
