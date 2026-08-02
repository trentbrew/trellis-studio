# Calendar multi-day spanning bars

> **Status:** In progress — ported from trellis-client `CalendarView.vue` segment-stitching.
> **Epic:** **TRL-201** · **TRL-200** / **TRL-202** (lane module) · month/week UI (create as children if missing)

## Goal

Render multi-day calendar events as **connected lane bars** in month/week views (not repeated chips per day). Reference implementation: `Packages/trellis-client/apps/web/app/components/views/CalendarView.vue` (`getMultiDayLanes`, `WeekRow`, `LaneSlot`).

Studio already has data support via `eventLocalSpan` / `eventOccurrencesInRange` in `packages/app/src/lib/calendar/event-model.ts`.

## Approach

1. **Lane layout module** (`multi-day-lanes.ts`) — week-scoped greedy packing + `globalLaneMap` for cross-row lane continuity; DST-safe `daysBetween`.
2. **Month view** — `weekRows` + per-cell `laneSlots`; bar segments with rounded ends / week-wrap masks; `-mx` bleed across grid borders.
3. **Week view** — same lane row above single-day chips.

## Trellis issues

| ID | Title | Priority | Depends |
| -- | ----- | -------- | ------- |
| **TRL-201** | Epic: Calendar multi-day spanning bars | high | — |
| **TRL-200** | Calendar multi-day lane layout module | high | TRL-201 |
| **TRL-202** | Calendar: multi-day lane layout module | high | TRL-201 |

Create if missing (CLI from `studio/` on `main`):

```bash
trellis issue create -t "Calendar month view multi-day bars" -P high -l calendar --parent TRL-201
trellis issue create -t "Calendar week view multi-day bars" -P high -l calendar --parent TRL-201
```

## Acceptance (epic)

- [ ] Multi-day events render as lane-aligned segments in month and week views
- [ ] Single-day / timed chips unchanged below lane area
- [ ] `multi-day-lanes.test.ts` covers overlap, week wrap, overflow
