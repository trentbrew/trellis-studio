import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Instance } from "../../project/instance"

export const SpriteCommand = cmd({
  command: "sprite",
  describe: "manage sprites",
  builder: (yargs: Argv) => yargs.command(SpriteDestroyCommand).demandCommand(),
  async handler() {},
})

export const SpriteDestroyCommand = cmd({
  command: "destroy <name>",
  describe: "destroy a sprite by name",
  builder: (yargs: Argv) => {
    return yargs.positional("name", {
      describe: "sprite name to destroy",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const name = args.name as string
      try {
        const dir = encodeURIComponent(Instance.directory)
        const url = `http://localhost:4096/trellis/sprites/${encodeURIComponent(name)}?directory=${dir}`
        const res = await fetch(url, { method: "DELETE" })
        const result = (await res.json()) as { success: boolean }
        if (result.success) {
          UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Sprite "${name}" destroyed` + UI.Style.TEXT_NORMAL)
        } else {
          UI.error(`Failed to destroy sprite "${name}"`)
          process.exit(1)
        }
      } catch (err) {
        UI.error(`Failed to destroy sprite "${name}": ${err}`)
        process.exit(1)
      }
    })
  },
})
