import { Process } from "@/util/process"

export interface RunBuildOptions {
  command: string
  cwd: string
  onLine?: (line: string) => void
  abort?: AbortSignal
}

/**
 * Run the publish build command in the project directory.
 * Streams combined stdout/stderr to `onLine` for the preview console.
 */
export async function runPublishBuild(opts: RunBuildOptions): Promise<void> {
  const parts = opts.command.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) throw new Error("build command is empty")

  const proc = Process.spawn(parts, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    shell: process.platform === "win32",
    abort: opts.abort,
    timeout: 15 * 60 * 1000,
  })

  const pump = (stream: NodeJS.ReadableStream | null, label: "stdout" | "stderr") => {
    if (!stream) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue
          opts.onLine?.(label === "stderr" ? `[stderr] ${line}` : line)
        }
      })
      stream.on("end", resolve)
      stream.on("error", reject)
    })
  }

  await Promise.all([pump(proc.stdout, "stdout"), pump(proc.stderr, "stderr")])
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`Build failed with exit code ${code}`)
  }
}
