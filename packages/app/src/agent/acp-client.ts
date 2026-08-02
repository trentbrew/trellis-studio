import { spawn, type ChildProcess } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk"
import { collectAssistantText } from "./acp-event-adapter"
import { defaultBridgeSpawn } from "./bridge-path"
import type { AcpSpikeResult } from "./types"

export type ClaudeAcpClientOptions = {
  cwd: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Auto-accept permission prompts (spike / local dev). */
  autoAcceptPermissions?: boolean
  onStderr?: (chunk: string) => void
}

export async function runClaudeAcpSpike(opts: ClaudeAcpClientOptions): Promise<AcpSpikeResult> {
  const spawnSpec = opts.command
    ? { command: opts.command, args: opts.args ?? [], cwd: opts.cwd, env: { ...process.env, ...opts.env } }
    : defaultBridgeSpawn(opts.cwd)

  const proc = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: spawnSpec.cwd,
    env: spawnSpec.env,
    stdio: ["pipe", "pipe", "pipe"],
  })

  const updates: unknown[] = []
  let initError: string | undefined
  let authRequired = false

  try {
    const conn = await connectClient(proc, {
      cwd: opts.cwd,
      autoAcceptPermissions: opts.autoAcceptPermissions ?? true,
      onUpdate: (u) => updates.push(u),
      onStderr: opts.onStderr,
    })

    const session = await conn.newSession({ cwd: opts.cwd, mcpServers: [] })
    const sessionId = session.sessionId

    await conn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "Reply with exactly: ACP_SPIKE_OK (no other text)." }],
    })

    const assistantText = collectAssistantText(updates as Parameters<typeof collectAssistantText>[0])
    const ok = assistantText.includes("ACP_SPIKE_OK")

    return { ok, sessionId, assistantText, updates }
  } catch (e) {
    if (e instanceof RequestError && e.code === -32000) {
      authRequired = true
      initError = "Claude Code authentication required. Run `claude login` in a terminal on this machine."
    } else {
      initError = e instanceof Error ? e.message : String(e)
    }
    return {
      ok: false,
      assistantText: collectAssistantText(updates as Parameters<typeof collectAssistantText>[0]),
      updates,
      error: initError,
      authRequired,
    }
  } finally {
    terminate(proc)
  }
}

type ConnectOpts = {
  cwd: string
  autoAcceptPermissions: boolean
  onUpdate: (params: unknown) => void
  onStderr?: (chunk: string) => void
}

async function connectClient(proc: ChildProcess, opts: ConnectOpts): Promise<ClientSideConnection> {
  if (!proc.stdin || !proc.stdout) throw new Error("Bridge process missing stdio pipes")

  const input = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        proc.stdin!.write(chunk, (err) => (err ? reject(err) : resolve()))
      })
    },
  })

  const output = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      proc.stdout!.on("end", () => controller.close())
      proc.stdout!.on("error", (err) => controller.error(err))
      if (proc.stderr) {
        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8")
          opts.onStderr?.(text)
        })
      }
    },
  })

  const stream = ndJsonStream(input, output)

  const conn = new ClientSideConnection((agent) => {
    return {
      sessionUpdate: async (params) => {
        opts.onUpdate(params)
      },
      requestPermission: async (): Promise<RequestPermissionResponse> => {
        if (!opts.autoAcceptPermissions) {
          return { outcome: { outcome: "cancelled" } }
        }
        return {
          outcome: {
            outcome: "selected",
            optionId: "allow",
          },
        }
      },
      fs_read_text_file: async (params: { path: string }) => {
        const path = join(opts.cwd, params.path)
        const content = await readFile(path, "utf8")
        return { content }
      },
      fs_write_text_file: async (params: { path: string; content: string }) => {
        const path = join(opts.cwd, params.path)
        await writeFile(path, params.content, "utf8")
      },
      terminal_create: async () => {
        throw new Error("terminal_create not implemented in spike client")
      },
      terminal_output: async () => ({ output: "" }),
      terminal_wait_for_exit: async () => ({ exitCode: 0 }),
      terminal_kill: async () => {},
      terminal_release: async () => {},
    }
  }, stream)

  await conn.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: false,
    },
    clientInfo: {
      name: "trellis-studio",
      version: "acp-spike",
    },
  })

  return conn
}

function terminate(proc: ChildProcess) {
  if (!proc.killed) {
    proc.kill("SIGTERM")
  }
}
