import { describe, expect, test } from "bun:test"
import { GlobalBus } from "../../src/bus/global"
import { EventLog } from "../../src/bus/event-log"

const emit = (type: string) => GlobalBus.emit("event", { directory: "global", payload: { type, properties: {} } })

describe("EventLog", () => {
  test("replays only frames after the given id, in order, with monotonic ids", () => {
    // Subscribe so the log is active, then take a snapshot of the current high id.
    const stop = EventLog.subscribe(() => {})
    const base = EventLog.since(0).at(-1)?.id ?? 0

    emit("a")
    emit("b")
    emit("c")

    const after = EventLog.since(base)
    expect(after.map((f) => JSON.parse(f.data).payload.type)).toEqual(["a", "b", "c"])
    // ids strictly increasing and contiguous from the snapshot.
    expect(after.map((f) => f.id)).toEqual([base + 1, base + 2, base + 3])

    // A cursor in the middle replays only what follows it.
    expect(EventLog.since(base + 1).map((f) => JSON.parse(f.data).payload.type)).toEqual(["b", "c"])
    // A cursor at the head replays nothing.
    expect(EventLog.since(base + 3)).toEqual([])
    stop()
  })

  test("live subscribers receive frames with ids matching the buffer", () => {
    const seen: EventLog.Frame[] = []
    const stop = EventLog.subscribe((f) => seen.push(f))
    emit("live")
    const last = seen.at(-1)!
    expect(JSON.parse(last.data).payload.type).toBe("live")
    // The same frame is retrievable from the replay buffer at its id.
    expect(EventLog.since(last.id - 1)[0]?.id).toBe(last.id)
    stop()
  })

  test("non-finite cursor replays nothing", () => {
    EventLog.subscribe(() => {})()
    expect(EventLog.since(Number.NaN)).toEqual([])
  })
})
