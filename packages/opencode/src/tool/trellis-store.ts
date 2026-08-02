import z from "zod"
import { Tool } from "./tool"
import { Trellis } from "../trellis"
import { StoreSDK } from "../trellis/store-sdk"

// ---------------------------------------------------------------------------
// trellis_store_query
// ---------------------------------------------------------------------------

const query = z.object({
  mode: z.enum(["entities", "entity", "facts", "links", "graph", "types"]).describe("Query mode"),
  id: z.string().optional().describe("Entity ID (for entity/graph mode)"),
  type: z.string().optional().describe("Entity type filter (for entities mode)"),
  attribute: z.string().optional().describe("Attribute name filter (for facts/links mode)"),
  value: z.string().optional().describe("Value filter (for facts mode)"),
  depth: z.number().optional().describe("Hop depth for graph mode (default: 1)"),
  limit: z.number().optional().describe("Max results (default: 100)"),
})

export const TrellisStoreQueryTool = Tool.define<typeof query, Record<string, any>>("trellis_store_query", {
  description: [
    "Query the Trellis EAV triple store. Use this to explore entities, facts, and links in the graph database.",
    "",
    "Modes:",
    "- entities: list entities, optionally filtered by type",
    "- entity: get full detail (facts + links) for one entity by id",
    "- facts: query facts by attribute and/or value",
    "- links: query links by entity and/or relationship attribute",
    "- graph: get an entity and its N-hop neighbors as a subgraph",
    "- types: list distinct entity types with counts",
  ].join("\n"),
  parameters: query,
  async execute(args) {
    const lim = args.limit ?? 100

    if (args.mode === "types") {
      const types = StoreSDK.entityTypes()
      if (types.length === 0) return { title: "Entity types", output: "No entities in store.", metadata: {} }
      const lines = types.map((t) => `${t.type} (${t.count})`)
      return {
        title: `${types.length} entity types`,
        output: `Entity types:\n${lines.join("\n")}`,
        metadata: { count: types.length },
      }
    }

    if (args.mode === "entities") {
      const entities = Trellis.storeEntities(undefined, { type: args.type, limit: lim })
      if (entities.length === 0) return { title: "Entities", output: "No entities found.", metadata: {} }
      const lines = entities.map((e) => `${e.id}  [${e.type}]`)
      return {
        title: `${entities.length} entities`,
        output: `Entities (${entities.length}):\n${lines.join("\n")}`,
        metadata: { count: entities.length },
      }
    }

    if (args.mode === "entity") {
      if (!args.id) return { title: "Error", output: "Entity id is required for entity mode.", metadata: {} }
      const detail = Trellis.storeEntity(args.id)
      if (!detail) return { title: "Not found", output: `Entity "${args.id}" not found.`, metadata: {} }
      const facts = detail.facts.map((f: any) => `  ${f.a} = ${f.v}`)
      const links = detail.links.map((l: any) => `  ${l.e1} --[${l.a}]--> ${l.e2}`)
      const parts = [`Entity: ${detail.id}`, "", "Facts:", ...facts]
      if (links.length) parts.push("", "Links:", ...links)
      return {
        title: detail.id,
        output: parts.join("\n"),
        metadata: { facts: detail.facts.length, links: detail.links.length },
      }
    }

    if (args.mode === "facts") {
      const facts = Trellis.storeFacts(undefined, { attribute: args.attribute, value: args.value, limit: lim })
      if (facts.length === 0) return { title: "Facts", output: "No facts found.", metadata: {} }
      const lines = facts.map((f) => `${f.e}  ${f.a} = ${f.v}`)
      return {
        title: `${facts.length} facts`,
        output: `Facts (${facts.length}):\n${lines.join("\n")}`,
        metadata: { count: facts.length },
      }
    }

    if (args.mode === "links") {
      const links = Trellis.storeLinks(undefined, { entity: args.id, attribute: args.attribute })
      if (links.length === 0) return { title: "Links", output: "No links found.", metadata: {} }
      const lines = links.map((l: any) => `${l.e1} --[${l.a}]--> ${l.e2}`)
      return {
        title: `${links.length} links`,
        output: `Links (${links.length}):\n${lines.join("\n")}`,
        metadata: { count: links.length },
      }
    }

    if (args.mode === "graph") {
      if (!args.id) return { title: "Error", output: "Entity id is required for graph mode.", metadata: {} }
      const graph = StoreSDK.getGraph(args.id, args.depth ?? 1)
      const parts = [`Subgraph for ${args.id} (depth ${args.depth ?? 1})`, ""]
      parts.push(`Nodes (${graph.nodes.length}):`)
      for (const node of graph.nodes) {
        parts.push(`  ${node.id} [${node.type ?? "?"}]`)
        for (const f of node.facts.slice(0, 5)) parts.push(`    ${f.a} = ${f.v}`)
        if (node.facts.length > 5) parts.push(`    ... +${node.facts.length - 5} more`)
      }
      if (graph.edges.length) {
        parts.push("", `Edges (${graph.edges.length}):`)
        for (const e of graph.edges) parts.push(`  ${e.e1} --[${e.a}]--> ${e.e2}`)
      }
      return {
        title: `Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
        output: parts.join("\n"),
        metadata: { nodes: graph.nodes.length, edges: graph.edges.length },
      }
    }

    return { title: "Error", output: `Unknown mode: ${args.mode}`, metadata: {} }
  },
})

// ---------------------------------------------------------------------------
// trellis_store_mutate
// ---------------------------------------------------------------------------

const mutate = z.object({
  action: z.enum(["define", "update", "delete", "assert", "retract", "link", "unlink"]).describe("Mutation action"),
  id: z.string().optional().describe("Entity ID"),
  type: z.string().optional().describe("Entity type (for define)"),
  attrs: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe("Attributes to set (for define/update). Use null to remove in update."),
  entity: z.string().optional().describe("Entity for fact assertion"),
  attribute: z.string().optional().describe("Attribute name"),
  value: z.union([z.string(), z.number(), z.boolean()]).optional().describe("Attribute value"),
  source: z.string().optional().describe("Source entity for link/unlink"),
  relation: z.string().optional().describe("Relationship name for link/unlink"),
  target: z.string().optional().describe("Target entity for link/unlink"),
})

export const TrellisStoreMutateTool = Tool.define<typeof mutate, Record<string, any>>("trellis_store_mutate", {
  description: [
    "Mutate the Trellis EAV triple store. Create, update, or delete entities and relationships.",
    "",
    "## When NOT to use this tool",
    "",
    "For user-facing content collections (blog posts, products, authors, profiles, recipes, lessons,",
    "anything someone would edit in a CMS), prefer the `cms` tool. It handles schemas, draft/publish",
    "state, per-field types (rich_text, reference, image, etc.), and surfaces work in the CMS UI",
    "automatically. Using this tool for content creates raw entities the CMS can detect (as inferred",
    "collections) but loses field-type intent — bodies become plain text, references become string",
    "facts, etc.",
    "",
    "Use this tool for: low-level graph operations, system entities (issues, decisions, milestones),",
    "ad-hoc relationships, or store ops the cms tool doesn't expose.",
    "",
    "For durable user/project facts and preferences, prefer the `memory` tool (type: memory entities",
    "injected into project-memory each turn) instead of raw define/assert here.",
    "",
    "## Actions",
    "",
    "- define: create a new entity with type and attributes",
    "- update: patch an entity's attributes (set null to remove)",
    "- delete: remove an entity and all its facts/links",
    "- assert: add raw fact(s)",
    "- retract: remove raw fact(s)",
    "- link: create a relationship between two entities",
    "- unlink: remove a relationship between two entities",
  ].join("\n"),
  parameters: mutate,
  async execute(args, ctx) {
    await ctx.ask({
      permission: "write",
      patterns: ["trellis-store"],
      always: ["trellis-store"],
      metadata: {},
    })

    if (args.action === "define") {
      if (!args.id || !args.type)
        return { title: "Error", output: "id and type are required for define.", metadata: {} }
      const clean: Record<string, string | number | boolean> = {}
      for (const [k, v] of Object.entries(args.attrs ?? {})) {
        if (v !== null && v !== undefined) clean[k] = v as string | number | boolean
      }
      const result = StoreSDK.defineEntity(args.type, args.id, clean)
      if (!result) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Defined ${args.id}`,
        output: `Created entity ${args.id} [${args.type}] with ${Object.keys(clean).length} attributes`,
        metadata: { id: args.id },
      }
    }

    if (args.action === "update") {
      if (!args.id) return { title: "Error", output: "id is required for update.", metadata: {} }
      const patch: Record<string, string | number | boolean | null> = {}
      for (const [k, v] of Object.entries(args.attrs ?? {})) patch[k] = v as string | number | boolean | null
      const result = StoreSDK.updateEntity(args.id, patch)
      if (!result) return { title: "Error", output: `Entity "${args.id}" not found.`, metadata: {} }
      return {
        title: `Updated ${args.id}`,
        output: `Updated ${args.id}: ${result.retracted} retracted, ${result.asserted} asserted`,
        metadata: { id: args.id, ...result },
      }
    }

    if (args.action === "delete") {
      if (!args.id) return { title: "Error", output: "id is required for delete.", metadata: {} }
      const result = StoreSDK.deleteEntity(args.id)
      if (!result) return { title: "Error", output: `Entity "${args.id}" not found.`, metadata: {} }
      return {
        title: `Deleted ${args.id}`,
        output: `Deleted ${args.id}: ${result.retracted} facts retracted, ${result.unlinked} links removed`,
        metadata: { id: args.id, ...result },
      }
    }

    if (args.action === "assert") {
      if (!args.entity || !args.attribute || args.value === undefined)
        return { title: "Error", output: "entity, attribute, and value are required for assert.", metadata: {} }
      const result = Trellis.storeAssert([{ e: args.entity, a: args.attribute, v: args.value }])
      if (!result) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Asserted fact`,
        output: `Asserted: ${args.entity}.${args.attribute} = ${args.value}`,
        metadata: {},
      }
    }

    if (args.action === "retract") {
      if (!args.entity || !args.attribute || args.value === undefined)
        return { title: "Error", output: "entity, attribute, and value are required for retract.", metadata: {} }
      const result = Trellis.storeRetract([{ e: args.entity, a: args.attribute, v: args.value }])
      if (!result) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Retracted fact`,
        output: `Retracted: ${args.entity}.${args.attribute} = ${args.value}`,
        metadata: {},
      }
    }

    if (args.action === "link") {
      if (!args.source || !args.relation || !args.target)
        return { title: "Error", output: "source, relation, and target are required for link.", metadata: {} }
      const result = StoreSDK.relate(args.source, args.relation, args.target)
      if (!result) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Linked`,
        output: `Linked: ${args.source} --[${args.relation}]--> ${args.target}`,
        metadata: {},
      }
    }

    if (args.action === "unlink") {
      if (!args.source || !args.relation || !args.target)
        return { title: "Error", output: "source, relation, and target are required for unlink.", metadata: {} }
      const result = StoreSDK.unrelate(args.source, args.relation, args.target)
      if (!result) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Unlinked`,
        output: `Unlinked: ${args.source} --[${args.relation}]--> ${args.target}`,
        metadata: {},
      }
    }

    return { title: "Error", output: `Unknown action: ${args.action}`, metadata: {} }
  },
})

// ---------------------------------------------------------------------------
// trellis_store_schema
// ---------------------------------------------------------------------------

const schema = z.object({
  mode: z.enum(["stats", "catalog", "attributes"]).describe("Schema inspection mode"),
  type: z.string().optional().describe("Entity type (for attributes mode)"),
})

export const TrellisStoreSchemaTool = Tool.define<typeof schema, Record<string, any>>("trellis_store_schema", {
  description: [
    "Inspect the Trellis EAV store schema. View statistics, the attribute catalog, or attributes used by a specific entity type.",
    "",
    "Modes:",
    "- stats: overall store statistics (entity/fact/link counts)",
    "- catalog: full attribute catalog with types, cardinality, and examples",
    "- attributes: attributes used by entities of a given type",
  ].join("\n"),
  parameters: schema,
  async execute(args) {
    if (args.mode === "stats") {
      const stats = Trellis.storeStats()
      if (!stats) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: "Store stats",
        output: [
          "EAV Store Statistics:",
          `  Entities:   ${stats.uniqueEntities}`,
          `  Facts:      ${stats.totalFacts}`,
          `  Links:      ${stats.totalLinks}`,
          `  Attributes: ${stats.uniqueAttributes}`,
          `  Catalog:    ${stats.catalogEntries} entries`,
        ].join("\n"),
        metadata: stats,
      }
    }

    if (args.mode === "catalog") {
      const catalog = Trellis.storeCatalog()
      if (catalog.length === 0) return { title: "Catalog", output: "Catalog is empty.", metadata: {} }
      const lines = catalog.map(
        (c: any) =>
          `${c.attribute.padEnd(24)} ${c.type.padEnd(8)} ${c.cardinality.padEnd(5)} distinct=${c.distinctCount}  ex: ${c.examples.slice(0, 2).join(", ")}`,
      )
      return {
        title: `${catalog.length} catalog entries`,
        output: `Attribute Catalog (${catalog.length}):\n${"Attribute".padEnd(24)} ${"Type".padEnd(8)} ${"Card".padEnd(5)} Info\n${"-".repeat(80)}\n${lines.join("\n")}`,
        metadata: { count: catalog.length },
      }
    }

    if (args.mode === "attributes") {
      if (!args.type) return { title: "Error", output: "type is required for attributes mode.", metadata: {} }
      const attrs = StoreSDK.attributesFor(args.type)
      if (attrs.length === 0)
        return { title: "Attributes", output: `No attributes found for type "${args.type}".`, metadata: {} }
      const lines = attrs.map((a) => `${a.attribute.padEnd(24)} used=${a.count}  ex: ${a.examples.join(", ")}`)
      return {
        title: `Attributes for ${args.type}`,
        output: `Attributes for type "${args.type}" (${attrs.length}):\n${lines.join("\n")}`,
        metadata: { type: args.type, count: attrs.length },
      }
    }

    return { title: "Error", output: `Unknown mode: ${args.mode}`, metadata: {} }
  },
})
