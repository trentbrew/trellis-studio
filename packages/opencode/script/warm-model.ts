#!/usr/bin/env bun
import { Model } from "../src/model"

const found = await Model.detect()
for (const x of found) {
  console.log(`  ${x.available ? "up  " : "down"}  ${x.name.padEnd(22)} ${x.endpoint}`)
}

if (!found.some((x) => x.available)) {
  console.log("\nNo model backend running — the model console will show start instructions.")
  process.exit(0)
}

const start = Date.now()
const { provider, backend } = await Model.connect()
const status = provider.status()

if (!status.warm) {
  console.log(`\n${backend.name} reachable but not warm: ${status.error ?? "unknown"}`)
  process.exit(0)
}

console.log(`\n${backend.name} warm in ${Date.now() - start}ms — weights pinned, first prompt is instant.`)
