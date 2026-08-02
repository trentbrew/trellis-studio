import { z } from "zod"
import { CORPUS_KINDS } from "./ontology"

export const corpusSlotSchema = z.object({
  key: z.string(),
  description: z.string(),
  elementIds: z.array(z.string()).optional(),
})

export const corpusEntrySchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  kind: z.enum(CORPUS_KINDS),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  elements: z.array(z.record(z.string(), z.unknown())),
  appState: z.record(z.string(), z.unknown()).optional(),
  slots: z.array(corpusSlotSchema).optional(),
})

export type CorpusEntry = z.infer<typeof corpusEntrySchema>
export type CorpusSlot = z.infer<typeof corpusSlotSchema>
