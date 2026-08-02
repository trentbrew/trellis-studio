import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const componentsDir = join(import.meta.dir, "../src/components")
const rows: string[] = []

for (const f of readdirSync(componentsDir)
  .filter((x) => x.endsWith(".stories.tsx"))
  .sort()) {
  const base = f.replace(".stories.tsx", "")
  const text = readFileSync(join(componentsDir, f), "utf8")
  const m = text.match(/title:\s*["'`]([^"'`]+)/)
  const title = m?.[1] ?? `UI/${base}`
  const id = `ui.${base}`
  rows.push(`| \`${id}\` | \`${base}\` | \`${title}\` |`)
}

const elevPath = join(import.meta.dir, "../src/theme/elevation.stories.tsx")
const elevText = readFileSync(elevPath, "utf8")
const em = elevText.match(/title:\s*["'`]([^"'`]+)/)
rows.push(`| \`ui.theme.elevation\` | \`theme/elevation\` | \`${em?.[1] ?? "Theme/Elevation"}\` |`)

console.log(rows.join("\n"))
