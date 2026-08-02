import { expect, test } from "bun:test"
import { join } from "node:path"

const root = join(import.meta.dir, "..", "..", "..")

test("root workspace links turtlecode bin for npx", async () => {
  const pkg = await Bun.file(join(root, "package.json")).text()
  const lock = await Bun.file(join(root, "bun.lock")).text()
  const cli = await Bun.file(join(root, "packages", "cli", "package.json")).text()

  expect(pkg).toContain('"turtlecode": "workspace:*"')
  expect(lock).toContain('"turtlecode": "workspace:*"')
  expect(cli).toContain('"turtlecode": "./bin/cli.mjs"')
})
