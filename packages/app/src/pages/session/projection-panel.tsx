import { Match, Switch, createMemo } from "solid-js"
import { ComingSoonAffordance } from "@/components/affordance"
import { RouteContent, RouteEmptyState, RoutePanel, RouteView } from "@/components/route"
import { useSync } from "@/context/sync"
import { configuredCustomProjections, getProjection } from "@/lib/projections"
import { NotesProjection } from "@/pages/session/notes-projection"
import { CalendarProjection } from "@/pages/session/calendar-projection"
import { ClockProjection } from "@/pages/session/clock-projection"
import { CronProjection } from "@/pages/session/cron-projection"
import { JournalProjection } from "@/pages/session/journal-projection"
import { CmsProjection } from "@/pages/session/cms-projection"
import { AssetsProjection } from "@/pages/session/assets-projection"
import { WhiteboardsProjection } from "@/pages/session/whiteboards-projection"

/** Affordances with bespoke renderers not yet covered by a layout recipe. */
const BESPOKE = new Set(["notes", "whiteboards", "calendar", "clock", "cron", "journal"])

export function ProjectionPanel(props: { lens: string }) {
  const sync = useSync()
  const customProjections = createMemo(() => configuredCustomProjections(sync.data.config))
  const def = () => getProjection(props.lens, customProjections())

  return (
    <Switch>
      <Match when={props.lens === "clock"}>
        <ClockProjection />
      </Match>

      <Match when={props.lens === "calendar"}>
        <CalendarProjection />
      </Match>

      <Match when={props.lens === "cron"}>
        <CronProjection />
      </Match>

      <Match when={props.lens === "journal"}>
        <JournalProjection />
      </Match>

      <Match when={props.lens === "whiteboards"}>
        <WhiteboardsProjection />
      </Match>

      <Match when={props.lens === "notes"}>
        <NotesProjection />
      </Match>

      <Match when={!BESPOKE.has(props.lens) && def()?.query.kind === "cms" && def()}>
        {(projection) => <CmsProjection projection={projection()} />}
      </Match>

      <Match when={!BESPOKE.has(props.lens) && def()?.query.kind === "assets" && def()}>
        {(projection) => <AssetsProjection projection={projection()} />}
      </Match>

      <Match when={def()}>
        {(projection) => <ComingSoonAffordance projection={projection()} />}
      </Match>

      <Match when={true}>
        <RouteView class="h-full">
          <RoutePanel affordance={props.lens} class="route-panel--compact h-full">
            <RouteContent>
              <RouteEmptyState
                title="Unknown affordance"
                description={`No lens registered for "${props.lens}".`}
              />
            </RouteContent>
          </RoutePanel>
        </RouteView>
      </Match>
    </Switch>
  )
}
