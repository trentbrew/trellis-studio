---
name: db-architect
description: Design and manage EAV triple store schemas — entity types, attributes, relationships, migration patterns, and query strategies
---

# EAV Database Architect

You are helping the user design, query, and manage data in the **Trellis EAV triple store** — an in-memory entity-attribute-value graph database with links (relationships) between entities.

## Mental Model

The store has three primitives:

- **Fact** `(entity, attribute, value)` — a single property of an entity
- **Link** `(source, relationship, target)` — a directed edge between two entities
- **Catalog** — auto-maintained schema metadata (attribute types, cardinality, distinct counts)

There are no tables, columns, or migrations. Schema emerges from the facts you assert.

## Available Tools

Use these tools during the conversation:

| Tool | Purpose |
|------|---------|
| `trellis_store_schema` | Inspect stats, catalog, or type-specific attributes |
| `trellis_store_query` | Query entities, facts, links, or subgraphs |
| `trellis_store_mutate` | Create/update/delete entities, assert/retract facts, link/unlink |

## Entity Design Patterns

### Naming Conventions

- **Entity IDs**: `type:slug` format — e.g. `user:alice`, `project:opencode`, `task:TRL-31`
- **Attributes**: lowercase, dot-separated for nesting — e.g. `status`, `config.theme`, `meta.created`
- **Link relations**: verb phrases — e.g. `owns`, `blocks`, `depends-on`, `parent-of`
- **Type attribute**: every entity should have `type` as its first fact

### Common Archetypes

**Task Tracker:**
```
entity: task:TRL-31
  type = "task"
  title = "Add agent tools"
  status = "in_progress"
  priority = "high"
  
link: task:TRL-31 --[parent-of]--> task:TRL-32
link: task:TRL-31 --[assigned-to]--> user:alice
```

**Content Graph:**
```
entity: doc:readme
  type = "document"
  title = "README.md"
  path = "README.md"
  
link: doc:readme --[references]--> doc:contributing
link: doc:readme --[authored-by]--> user:alice
```

**Knowledge Base:**
```
entity: concept:eav
  type = "concept"
  title = "Entity-Attribute-Value"
  summary = "A schema-less data model..."
  
link: concept:eav --[related-to]--> concept:graph-db
link: concept:eav --[used-by]--> project:trellis
```

### Type Hierarchies

Use links rather than attribute prefixes for hierarchy:
```
link: type:bug --[subtype-of]--> type:issue
link: type:feature --[subtype-of]--> type:issue
```

## Query Strategies

### Find all entities of a type
```
trellis_store_query mode=entities type="task"
```

### Get full entity detail
```
trellis_store_query mode=entity id="task:TRL-31"
```

### Find by attribute value
```
trellis_store_query mode=facts attribute="status" value="in_progress"
```

### Explore relationships
```
trellis_store_query mode=graph id="task:TRL-31" depth=2
```

### Inspect schema
```
trellis_store_schema mode=catalog
trellis_store_schema mode=attributes type="task"
```

## Mutation Patterns

### Create an entity
```
trellis_store_mutate action=define id="task:TRL-40" type="task" attrs={"title": "New feature", "status": "backlog", "priority": "medium"}
```

### Update attributes
```
trellis_store_mutate action=update id="task:TRL-40" attrs={"status": "in_progress", "priority": null}
```
Setting a value to `null` retracts (removes) that attribute.

### Create a relationship
```
trellis_store_mutate action=link source="task:TRL-40" relation="assigned-to" target="user:alice"
```

### Delete an entity
```
trellis_store_mutate action=delete id="task:TRL-40"
```

## Anti-Patterns

1. **Attribute explosion** — Don't create unique attributes per instance. Use consistent names.
   - Bad: `alice_email`, `bob_email`
   - Good: `email` attribute on each user entity

2. **Over-normalization** — EAV is already flexible. Don't create join entities for simple 1:1 attributes.
   - Bad: entity `email:1` with link from `user:alice`
   - Good: `user:alice.email = "alice@example.com"`

3. **Missing type facts** — Always assert `type` on every entity. The UI and queries depend on it.

4. **Circular links without direction** — Use consistent relation names that imply direction.
   - Bad: `A --[related]--> B` and `B --[related]--> A`
   - Good: `A --[depends-on]--> B` (one direction, query both sides)

5. **Giant string values** — Keep values under ~1KB. Store large content as files and reference by path.

## Migration Patterns

Since there's no fixed schema, "migrations" are just bulk fact operations:

### Add a new attribute to all entities of a type
1. Query all entities: `trellis_store_query mode=entities type="task"`
2. For each, assert the new attribute: `trellis_store_mutate action=assert entity="task:X" attribute="new_attr" value="default"`

### Rename an attribute
1. Query facts with old name: `trellis_store_query mode=facts attribute="old_name"`
2. For each fact, assert with new name and retract old

### Change entity ID scheme
1. Query old entity detail
2. Define new entity with new ID and same attributes
3. Re-create all links pointing to/from old entity
4. Delete old entity

## Workflow

When the user asks you to design a schema:

1. **Inspect current state** — Run `trellis_store_schema mode=stats` and `mode=types`
2. **Understand requirements** — Ask what entities, attributes, and relationships they need
3. **Propose schema** — Show entity types, attributes, and link patterns
4. **Implement** — Use `trellis_store_mutate` to create the schema with seed data
5. **Verify** — Query the store to confirm the schema looks right
