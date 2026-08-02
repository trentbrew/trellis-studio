import fs from "fs/promises"
import path from "path"
import z from "zod"

const TEMPLATE_ROOT_ENV = "OPENCODE_PROJECT_TEMPLATE_DIR"

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".svelte",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
])

const TEXT_FILES = new Set([".gitignore", ".npmrc", "AGENTS.md", "README.md"])

async function exists(target: string) {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false)
}

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  )
}

function starterTemplatesRoot() {
  const override = process.env[TEMPLATE_ROOT_ENV]
  if (override) return path.resolve(override)

  const candidates = [
    path.resolve(import.meta.dir, "../../../../starter-templates/projects"),
    path.resolve(process.cwd(), "starter-templates/projects"),
    path.resolve(process.cwd(), "../../starter-templates/projects"),
  ]
  return candidates[0]!
}

async function catalogRoot() {
  const override = process.env[TEMPLATE_ROOT_ENV]
  if (override) return path.resolve(override)

  const candidates = [
    starterTemplatesRoot(),
    path.resolve(process.cwd(), "starter-templates/projects"),
    path.resolve(process.cwd(), "../../starter-templates/projects"),
  ]

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate
  }
  return candidates[0]!
}

function isTextFile(file: string) {
  const name = path.basename(file)
  return TEXT_FILES.has(name) || TEXT_EXTENSIONS.has(path.extname(file))
}

function render(input: string, variables: Record<string, string>) {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => variables[key] ?? match)
}

async function isEmptyDirectory(target: string) {
  const entries = await fs.readdir(target).catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  })
  return entries.length === 0
}

async function copyTemplateDirectory(source: string, target: string, variables: Record<string, string>) {
  await fs.mkdir(target, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, render(entry.name, variables))

    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, targetPath, variables)
      continue
    }

    if (entry.isSymbolicLink()) {
      const link = await fs.readlink(sourcePath)
      await fs.symlink(link, targetPath)
      continue
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    if (!isTextFile(sourcePath)) {
      await fs.copyFile(sourcePath, targetPath)
      continue
    }

    const content = await fs.readFile(sourcePath, "utf8")
    await fs.writeFile(targetPath, render(content, variables), "utf8")
  }
}

async function initGit(target: string) {
  try {
    const proc = Bun.spawn(["git", "init", "--quiet"], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    })
    await proc.exited
  } catch {
    // Git is a convenience for project identity and snapshots; template creation
    // should still succeed in stripped-down sandboxes.
  }
}

export namespace ProjectTemplate {
  export const Kind = z.enum([
    "app",
    "web",
    "mobile",
    "video",
    "game",
    "docs",
    "slides",
    "audio",
    "data",
    "commerce",
    "productivity",
  ])
  export type Kind = z.infer<typeof Kind>

  export const Info = z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      kind: Kind,
      tags: z.array(z.string()).default([]),
      icon: z.string().optional(),
      projections: z
        .object({
          workspaceType: z.string().optional(),
          pinned: z.array(z.string()).optional(),
        })
        .optional(),
      preview: z
        .object({
          service: z.string().optional(),
          command: z.string().optional(),
          port: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .strict()
    .meta({ ref: "ProjectTemplate" })
  export type Info = z.infer<typeof Info>

  export const CreateInput = z
    .object({
      id: z.string().min(1),
      name: z.string().min(1).max(160),
      dir: z.string().optional(),
      target: z.string().optional(),
      initGit: z.boolean().optional(),
    })
    .strict()
    .meta({ ref: "ProjectTemplateCreateInput" })
  export type CreateInput = z.infer<typeof CreateInput>

  export const CreateResult = z
    .object({
      path: z.string(),
      template: Info,
    })
    .meta({ ref: "ProjectTemplateCreateResult" })
  export type CreateResult = z.infer<typeof CreateResult>

  export async function list(): Promise<Info[]> {
    const root = await catalogRoot()
    const entries = await fs.readdir(root, { withFileTypes: true }).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
      throw err
    })

    const templates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const file = path.join(root, entry.name, "template.json")
          const content = await fs.readFile(file, "utf8").catch(() => undefined)
          if (!content) return undefined
          return Info.parse(JSON.parse(content))
        }),
    )

    return templates
      .filter((template): template is Info => Boolean(template))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  export async function get(id: string): Promise<Info | undefined> {
    return (await list()).find((template) => template.id === id)
  }

  export async function create(input: CreateInput): Promise<CreateResult> {
    const root = await catalogRoot()
    const template = await get(input.id)
    if (!template) throw new Error(`Unknown project template: ${input.id}`)

    const name = input.name.trim()
    if (!name) throw new Error("Project name is required")
    const slug = slugify(name)
    const target = path.resolve(
      input.target ?? path.join(input.dir ?? path.join(process.env.HOME || "", ".turtlecode"), slug),
    )
    const source = path.join(root, template.id, "files")

    if (!(await exists(source))) throw new Error(`Project template has no files: ${template.id}`)
    if ((await exists(target)) && !(await isEmptyDirectory(target))) {
      throw new Error(`Target directory is not empty: ${target}`)
    }

    await copyTemplateDirectory(source, target, {
      name,
      slug,
      templateId: template.id,
      templateName: template.name,
    })

    if (input.initGit ?? true) await initGit(target)

    return {
      path: target,
      template,
    }
  }
}
