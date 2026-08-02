---
description: inspect or design EAV schema
subtask: true
---

Analyze the current EAV store schema and help architect changes. Load the `db-architect` skill first for detailed patterns and best practices, then use the store tools to inspect and modify the schema.

1. Run `trellis_store_schema mode=stats` for an overview
2. Run `trellis_store_schema mode=catalog` for the full attribute catalog
3. Run `trellis_store_schema mode=types` to see entity types

Then help the user with their schema design request.

$ARGUMENTS
