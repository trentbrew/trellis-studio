import path from "path"
import z from "zod"
import { Tool } from "./tool"
import { Instance } from "@/project/instance"
import { Bus } from "@/bus"
import { UIEvent } from "./ui"
import { importCsv } from "../trellis/csv-import"

const params = z.object({
  file: z.string().trim().min(1).describe("CSV file path, absolute or relative to the workspace root."),
  collection: z.string().trim().min(1).describe("Target CMS collection key, e.g. records or contacts."),
  label: z.string().trim().min(1).max(200).optional().describe("Collection label when the import creates it."),
  status: z.enum(["draft", "published", "archived"]).optional().describe("Default status for imported rows."),
  schema: z.enum(["extend", "none"]).optional().describe("Use extend to add CSV columns to the CMS schema."),
  dryRun: z.boolean().optional().describe("Parse and plan the import without mutating the store."),
})

export const CsvImportTool = Tool.define<typeof params, Record<string, unknown>>("csv_import", {
  description: [
    "Batch import a CSV file into a Trellis CMS collection in one store mutation.",
    "",
    "Use this whenever the user provides a CSV or spreadsheet-like list. Do not loop over rows with cms.create_entry",
    "or trellis_store_mutate. This tool parses headers, infers field types, extends the collection schema, and imports",
    "all rows as CMS entries.",
    "",
    "IDs: an id column is honored; otherwise name/title/label/description creates stable IDs. Re-imports with the same",
    "IDs update imported fields by retracting old values first.",
    "",
    "Defaults: status=draft, schema=extend.",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    const file = path.isAbsolute(input.file) ? input.file : path.join(Instance.directory, input.file)

    await ctx.ask({
      permission: "write",
      patterns: ["trellis-store"],
      always: ["trellis-store"],
      metadata: { file: input.file, collection: input.collection, action: "csv_import" },
    })

    const result = importCsv({
      csv: await Bun.file(file).text(),
      collection: input.collection,
      label: input.label,
      status: input.status,
      schema: input.schema,
      dryRun: input.dryRun,
      dir: Instance.directory,
      meta: {
        actor: "csv_import",
        actorKind: "agent",
        source: "csv_import",
        sessionID: ctx.sessionID,
        reason: `csv import ${input.file}`,
      },
    })

    if (!input.dryRun) {
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection: result.collection, entry: result.ids[0] },
      })
    }

    const fields = result.schema.extended.length ? ` Extended schema: ${result.schema.extended.join(", ")}.` : ""
    const warnings = result.warnings.length ? `\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join("\n")}` : ""
    const sample = result.ids.slice(0, 5).join(", ")
    const verb = input.dryRun ? "Would import" : "Imported"

    return {
      title: `${verb} ${result.imported} rows`,
      metadata: result,
      output:
        `${verb} ${result.imported} row(s) into "${result.collection}" with ` +
        `${result.facts} asserted fact(s) and ${result.retracted} retracted fact(s).${fields}\n` +
        `First IDs: ${sample}${warnings}`,
    }
  },
})
