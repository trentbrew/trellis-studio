---
description: query or mutate the Trellis EAV store
---

Interact with the Trellis EAV triple store. You have access to these tools:

- `trellis_store_query` — query entities, facts, links, or subgraphs
- `trellis_store_mutate` — create/update/delete entities, assert/retract facts, link/unlink
- `trellis_store_schema` — inspect store stats, attribute catalog, or type-specific attributes

Start by running `trellis_store_schema mode=stats` to understand the current state, then proceed with the user's request.

$ARGUMENTS
