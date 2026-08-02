import { execFile } from "child_process"
import { promisify } from "util"
import type { TcpListener } from "./types"

const execFileAsync = promisify(execFile)

/** Parse `lsof -iTCP -sTCP:LISTEN -n -P` lines. One entry per port (first wins). */
export function parseLsofListen(stdout: string): TcpListener[] {
  const byPort = new Map<number, TcpListener>()

  for (const line of stdout.split("\n")) {
    if (!line.includes("LISTEN")) continue
    const match = line.match(/^(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+TCP\s+([^:\s]+):(\d+)\s+\(LISTEN\)/)
    if (!match) continue

    const port = Number(match[4])
    if (!Number.isFinite(port) || port <= 0) continue

    if (byPort.has(port)) continue
    byPort.set(port, {
      command: match[1],
      pid: Number(match[2]),
      address: match[3],
      port,
    })
  }

  return [...byPort.values()].sort((a, b) => a.port - b.port)
}

export async function listTcpListeners(cwd: string): Promise<TcpListener[]> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-iTCP", "-sTCP:LISTEN", "-n", "-P"], {
      cwd,
      timeout: 8_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return parseLsofListen(stdout)
  } catch {
    return []
  }
}
