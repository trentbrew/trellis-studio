export type Scenario = {
  name: string
  skip?: true
  run(): Promise<void>
}

export type EvalResult = {
  name: string
  passed: boolean
  duration: number
  error?: string
  skipped?: boolean
}

export async function runEval(label: string, scenarios: Scenario[]): Promise<EvalResult[]> {
  const results: EvalResult[] = []
  const w = 50

  process.stdout.write(`\nEVAL: ${label}\n${"─".repeat(w + 10)}\n`)

  for (const s of scenarios) {
    if (s.skip) {
      process.stdout.write(`  ⊘  ${s.name.padEnd(w)} [skip]\n`)
      results.push({ name: s.name, passed: false, duration: 0, skipped: true })
      continue
    }

    const t = Date.now()
    try {
      await s.run()
      const ms = Date.now() - t
      process.stdout.write(`  ✓  ${s.name.padEnd(w)} ${ms}ms\n`)
      results.push({ name: s.name, passed: true, duration: ms })
    } catch (err) {
      const ms = Date.now() - t
      const msg = err instanceof Error ? err.message : String(err)
      process.stdout.write(`  ✗  ${s.name.padEnd(w)} ${ms}ms\n     ${msg}\n`)
      results.push({ name: s.name, passed: false, duration: ms, error: msg })
    }
  }

  const passed = results.filter((r) => r.passed).length
  const active = results.filter((r) => !r.skipped)
  const total = active.length
  const ms = results.reduce((s, r) => s + r.duration, 0)
  const pct = total === 0 ? 100 : Math.round((passed / total) * 100)

  process.stdout.write(`${"─".repeat(w + 10)}\n  ${passed}/${total} passed (${pct}%)  total: ${ms}ms\n\n`)

  return results
}

export function assertAllPassed(results: EvalResult[]) {
  const failed = results.filter((r) => !r.passed && !r.skipped)
  if (failed.length === 0) return
  throw new Error(`${failed.length} scenario(s) failed:\n${failed.map((f) => `  • ${f.name}: ${f.error}`).join("\n")}`)
}
