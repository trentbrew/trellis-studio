import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
import { Project } from "./project"
import { Vcs } from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import { Trellis } from "@/trellis"
import { Memory } from "@/trellis/memory"

function commandConfigPath(file: string) {
  return file.includes("/.opencode/command/") || file.includes("/.opencode/commands/")
}

function directoryForCommandFile(file: string) {
  for (const marker of ["/.opencode/command/", "/.opencode/commands/"]) {
    const index = file.indexOf(marker)
    if (index !== -1) return file.slice(0, index)
  }
}

let commandReloadWatcherReady = false

function ensureCommandReloadWatcher() {
  if (commandReloadWatcherReady) return
  commandReloadWatcherReady = true

  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  Bus.subscribe(FileWatcher.Event.Updated, (payload) => {
    const file = payload.properties.file
    if (!commandConfigPath(file)) return
    const directory = directoryForCommandFile(file)
    if (!directory) return
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined
      void (async () => {
        const { project, sandbox: worktree } = await Project.fromDirectory(directory)
        await Instance.reload({
          directory,
          project,
          worktree,
          init: InstanceBootstrap,
        })
      })().catch((err) => {
        Log.Default.warn("instance reload failed after command file change", {
          directory,
          file,
          error: String(err),
        })
      })
    }, 300)
  })
}

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  ensureCommandReloadWatcher()
  await Plugin.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  await File.init()
  FileWatcher.init()
  Vcs.init()
  await Trellis.init()
    .then((eng) => {
      if (!eng) Log.Default.warn("trellis init skipped", { directory: Instance.directory })
      else Memory.ensureIndexed()
    })
    .catch((err) => Log.Default.warn("trellis init failed", { error: String(err), directory: Instance.directory }))
  Snapshot.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })
}
