# MetaFlow MCP Contributions

This folder contains MCP tool manifests we are contributing back to the
OpenMetadata MCP ecosystem. Each `*.json` file follows the Model Context
Protocol tool-manifest shape and references a working reference
implementation inside `metaflow/backend/`.

> The OpenMetadata hackathon talk explicitly called this out as a top
> path: _"a great idea for the hackathon is taking those tools, adding
> to them, building on top of them, refining them, making them more
> powerful or efficient."_

## Tools

### `om_apply_health_score`

Writes a 0–100 MetaFlow health score with a per-dimension breakdown
back to an OpenMetadata entity as a **native custom property**
(`metaflow_health_score` on the entity's `extension` block).

- **Why it's new**: OM 1.12 ships custom properties, but there's no
  canonical way for an autonomous agent to write a normalized score
  back to an entity in a way the UI surfaces alongside the entity's
  other metadata. This tool defines that contract.
- **Idempotent**: registers the custom property the first time it's
  used; subsequent calls just PATCH the value.
- **Reference impl**: [`metaflow/backend/app/core/governance.py`](../metaflow/backend/app/core/governance.py) → `write_health_score`.
- **REST bridge**: `POST /api/governance/health-score`.
- **MCP manifest**: [`om_apply_health_score.json`](om_apply_health_score.json).

## Wiring it into OM's MCP server

These manifests are designed to drop into OM's MCP server's tool
registry. The shape matches OM's existing tool definitions; the
`implementation.kind = "rest-bridge"` field tells the MCP server to
proxy the call to the MetaFlow backend (or any equivalent
implementation) instead of running Java logic directly.
