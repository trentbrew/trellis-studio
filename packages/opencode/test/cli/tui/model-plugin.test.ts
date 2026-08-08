import { expect, test } from "bun:test"
import type { TuiCommand, TuiRouteDefinition } from "@opencode-ai/plugin/tui"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import plugin from "../../../src/cli/cmd/tui/feature-plugins/model"

async function install() {
  const base = createTuiPluginApi()
  const routes: TuiRouteDefinition[] = []
  const commands: (() => TuiCommand[])[] = []
  const navigated: string[] = []

  const api = {
    ...base,
    route: {
      register(list: TuiRouteDefinition[]) {
        routes.push(...list)
        return () => {}
      },
      navigate(name: string) {
        navigated.push(name)
      },
      get current() {
        return base.route.current
      },
    },
    command: {
      register(cb: () => TuiCommand[]) {
        commands.push(cb)
        return () => {}
      },
      trigger: () => {},
    },
  }

  const meta = { id: plugin.id } as unknown as Parameters<typeof plugin.tui>[2]
  await plugin.tui(api as unknown as Parameters<typeof plugin.tui>[0], undefined, meta)
  return { routes, commands: commands.flatMap((cb) => cb()), navigated }
}

test("registers the model console route", async () => {
  const { routes } = await install()
  expect(routes.map((x) => x.name)).toEqual(["model.console"])
})

test("exposes slash commands for the console and backend probe", async () => {
  const { commands } = await install()
  expect(commands.map((x) => x.slash?.name).sort()).toEqual(["model-console", "model-detect", "model-warm"])
  expect(commands.every((x) => x.category === "Model")).toBe(true)
})

test("console command navigates to the registered route", async () => {
  const { commands, navigated } = await install()
  commands.find((x) => x.value === "model.console")?.onSelect?.()
  expect(navigated).toEqual(["model.console"])
})
