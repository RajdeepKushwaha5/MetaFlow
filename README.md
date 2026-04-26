<div align="center">

# MetaFlow

### AI Control Plane for OpenMetadata

**OpenMetadata Hackathon — Primary Track T-01: MCP Ecosystem & AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev)
[![OpenMetadata](https://img.shields.io/badge/OpenMetadata-v1.12.4-orange.svg)](https://open-metadata.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-Supervisor-purple.svg)](https://langchain-ai.github.io/langgraph)

</div>

---

> **MetaFlow turns OpenMetadata into the control plane for AI-driven data operations.** It does not just read your catalog — it reasons over it, writes governed metadata back into it, and coordinates 12 specialist agents across 7 platforms to resolve incidents from detection to handoff without human intervention.

---

## The Problem

Modern data teams already have catalogs, lineage, quality tests, incident tools, and chat apps. The hard part is that these remain disconnected.

When a pipeline breaks at 2 AM, the alert fires — but it doesn't know the lineage, the contract, who owns the table, or what fix to draft. An engineer wakes up, opens five tools, and spends three hours doing manually what a governed AI system should have handled in 90 seconds.

## The Solution

MetaFlow is the AI action layer that closes that gap.

```
OpenMetadata signal  →  MetaFlow agents reason  →  Governed write-back + team handoff
```

The Continuous Steward watches the catalog autonomously. When something breaks, MetaFlow traces the blast radius, generates or checks the data contract, classifies the violation, drafts the remediation, and hands off a real GitHub issue or Jira ticket — all before a human sees the first alert.

---

## What Judges Will See

| Signal | Proof |
|--------|-------|
| Autonomous detection | Steward found a real email-format violation before demo start; health_score=55 written to OM |
| Live nav badge | Pulsing red count on "Operations" appears the moment a webhook arrives, no polling delay |
| Governance write-back | `metaflow_health_score` visible under **Custom Properties** in OpenMetadata's native UI after browser refresh |
| Real GitHub issue | Created live during demo — verifiable at [RajdeepKushwaha5/MetaFlow/issues](https://github.com/RajdeepKushwaha5/MetaFlow/issues) |
| 9/9 judge checks | `/api/system/judge-check` returns `passed=9, total=9, ok=true` deterministically |
| 43 API routes | `/docs` shows the full route listing; no mocks, no stubs |
| Idempotent behavior | Running the demo twice doesn't pollute the catalog — test-case materialize skips duplicates |

---

## Hackathon Track Coverage

| Track | MetaFlow feature |
|-------|-----------------|
| **T-01 MCP Ecosystem & AI Agents** | LangGraph supervisor + 12 specialist agents over OpenMetadata MCP-style tools; streaming reasoning visible in UI |
| **T-02 Data Observability** | Contract Copilot, test materialization, schema drift timeline, Continuous Steward background loop |
| **T-03 Connectors & Ingestion** | Full local OpenMetadata v1.12.4 stack (MySQL + Elasticsearch + ingestion); connector-style export at `/api/connector/export` |
| **T-04 Developer Tooling / CI-CD** | Remediation agent classifies failures, drafts SQL/dbt fixes, assembles GitHub-ready PR packages |
| **T-05 Community & Comms Apps** | GitHub, Slack, Jira, Notion, Google Workspace, Email — one orchestrator, seven platforms, one prompt |
| **T-06 Governance & Classification** | Health-score PATCH to OpenMetadata native UI; glossary, description, tag, and PII governance write-backs |

---

## Core Features

### 1. Continuous Data Steward

Background monitoring loop that autonomously polls OpenMetadata for metadata changes, quality signals, and governance gaps. Maintains a live event buffer with severity classification.

- Fires a real-time incident badge in the UI the moment a webhook arrives
- Writes health scores back to OpenMetadata without a button click
- Digest endpoint exposes every observed event with category, severity, and action taken

### 2. Data Contract Copilot

End-to-end contract lifecycle: generate → publish → materialize tests → inspect status → heal.

Given a table FQN, the agent walks schema metadata, profiler stats, lineage context, and ownership to produce a contract with enforced quality gates. The contract is published as a native OpenMetadata data contract — not a MetaFlow-only object.

Quality gate examples generated for `dim_customer`:

- `columnValuesToBeNotNull` on `customer_id`
- `columnValuesToBeUnique` on `customer_id`
- `columnValuesToMatchRegex` on `email` — the gate that caught the live incident
- `columnValuesToBeInSet` on `loyalty_tier`
- `tableRowCountToBeBetween` (daily volume SLA)

Materialize is idempotent: if the test case already exists in OpenMetadata, MetaFlow skips it.

### 3. Self-Healing Remediation

When a contract violation is reported, the Remediation Agent:

1. Classifies the failure type (`DATA_FORMAT_VIOLATION`, `NULL_VIOLATION`, etc.)
2. Walks upstream column-level lineage to find the root cause table
3. Drafts a SQL fix and likely file paths
4. Assembles a PR title, body, and labels ready for GitHub review

MetaFlow drafts the fix — the engineer approves. Reviewable, not autonomous code push.

### 4. Governance Write-Back

The Governance Agent computes a composite health score (metadata completeness + contract coverage + quality pass rate + PII coverage) and PATCHes it back to OpenMetadata as the `metaflow_health_score` custom property.

This is the critical proof point: the value appears in OpenMetadata's native **Custom Properties** panel, survives a browser refresh, and is visible to any OpenMetadata user — not just MetaFlow.

Additional write-back capabilities:
- description patching
- glossary and glossary term creation
- tag and classification assignment
- PII column scanning

### 5. Multi-Specialist LangGraph Orchestrator

A LangGraph supervisor routes user requests to the right specialist. The streaming UI shows which agent is active and which tool calls it fires — full observability into the reasoning chain.

**12 specialists:** Discovery · Lineage · Curator · Data Quality · Governance · GitHub · Slack · Google · Email · Jira · Notion · Insights

### 6. Playbooks

13 pre-built one-click production workflows:

| Playbook | What it does |
|----------|-------------|
| DQ Fire Drill | Trigger → diagnose → draft fix → notify |
| Impact Radar | Blast radius for a failing table |
| Contract Publisher | Generate + publish + materialize for any FQN |
| PII Sweep | Find untagged sensitive columns catalog-wide |
| Metadata Health | Ownership, descriptions, quality coverage scan |
| Incident Response | Cross-platform alert + ticket creation |
| + 7 more | Lineage audit, schema drift review, persona publish, etc. |

### 7. Webhook Auto-Triage

`POST /api/webhooks/openmetadata` — receives native OpenMetadata webhook payloads, classifies the event, routes to the correct playbook, and bumps the live incident badge.

### 8. Metrics & Efficiency

`GET /api/metrics/efficiency` — returns live token efficiency stats. The About page displays a **Tokens Saved** counter so judges can see operational overhead being reduced in real time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend  (port 3000)                                    │
│  Chat · Playbooks · Contract Copilot · Governance · Steward     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP + SSE (streaming)
┌──────────────────────────▼──────────────────────────────────────┐
│  FastAPI Backend  (port 8000)                                   │
│  43 routes · Judge-check API · Webhook handler                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LangGraph Supervisor                                   │   │
│  │  12 Specialist Agents                                   │   │
│  └──────────────┬──────────────────────────────────────────┘   │
│                 │                                               │
│  ┌──────────────▼──────────────────────────────────────────┐   │
│  │  Tool Layer  (MCP-style)                                │   │
│  │  OM Native · Lineage · Governance · Contract            │   │
│  │  GitHub · Slack · Jira · Notion · Google · Email        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  OpenMetadata v1.12.4  (port 8585)                              │
│  MySQL · Elasticsearch · Ingestion Service                      │
└─────────────────────────────────────────────────────────────────┘
         │ also connects to
         ▼
GitHub · Slack · Jira · Notion · Google Workspace · Email
```

---

## Quick Start

### Prerequisites

- Docker Desktop (≥ 6 GB memory allocated)
- Docker Compose
- Git

### 1. Clone

```bash
git clone https://github.com/RajdeepKushwaha5/MetaFlow.git
cd MetaFlow
```

### 2. Configure

Create `backend/.env`:

```env
# LLM
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GOOGLE_API_KEY=your_gemini_key
# Optional key rotation (comma-separated)
GOOGLE_API_KEYS=key1,key2,key3

# OpenMetadata (internal Docker network address)
AI_SDK_HOST=http://openmetadata-server:8585
AI_SDK_TOKEN=your_openmetadata_admin_token

# Demo flags
DEMO_MODE=false
JUDGE_MODE=true
JUDGE_DRY_RUN=false
STEWARD_ENABLED=true

# Optional integrations
GITHUB_TOKEN=
GITHUB_DEFAULT_REPO=owner/repo
SLACK_WEBHOOK_URL=
JIRA_URL=
JIRA_USER=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=
NOTION_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

> **Never commit real keys.** Add `backend/.env` to `.gitignore` (already done).

### 3. Start

```bash
docker compose up -d --build
```

### 4. Verify

```bash
# All 6 containers healthy
docker compose ps

# Backend health
curl http://localhost:8000/health

# 9/9 judge checks
curl "http://localhost:8000/api/system/judge-check?entity_fqn=sample_db_service.ecommerce_db.shopify.dim_customer"
```

Expected:

```json
{ "passed": 9, "total": 9, "ok": true }
```

### 5. Open

| Service | URL |
|---------|-----|
| MetaFlow UI | http://localhost:3000 |
| OpenMetadata | http://localhost:8585 |
| API docs | http://localhost:8000/docs |

OpenMetadata login: `judge@open-metadata.org` / `Admin@123`

---

## Key API Endpoints

### System

```
GET  /health
GET  /api/system/info
GET  /api/system/judge-check
```

### Contract Copilot

```
GET  /api/reliability/contract
POST /api/reliability/contract/publish
GET  /api/reliability/contract/status
POST /api/reliability/contract/create-tests
POST /api/reliability/contract/heal
```

### Reliability & Remediation

```
GET  /api/reliability/impact
GET  /api/reliability/cause-tree
GET  /api/reliability/recommendations
GET  /api/reliability/auto-remediate
POST /api/reliability/dispatch-ticket
```

### Governance

```
POST /api/governance/health-score
POST /api/governance/description
POST /api/governance/glossary
GET  /api/governance/schema-drift
```

### Steward & Metrics

```
GET  /api/steward/state
GET  /api/steward/digest
POST /api/steward/start
POST /api/steward/stop
POST /api/steward/clear-unread
GET  /api/metrics/scan
GET  /api/metrics/efficiency
```

### Chat, Playbooks, Personas

```
POST /api/chat
GET  /api/playbooks
POST /api/playbooks/run
GET  /api/personas
POST /api/personas/publish
```

### Webhooks

```
POST /api/webhooks/openmetadata
POST /webhooks/contract-violation
GET  /api/connector/export
```

---

## MCP Contribution

### `om_apply_health_score` Tool Spec

`mcp_contrib/om_apply_health_score.json`

A reusable MCP-style tool spec that describes how an autonomous agent can write a composite health score and per-dimension breakdown back to an OpenMetadata entity as a native custom property. Reference implementation: `backend/app/core/governance.py`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, ReactFlow |
| Backend | FastAPI, Python 3.11 |
| Streaming | Server-Sent Events |
| Agent orchestration | LangGraph, langgraph-supervisor |
| LLM | Google Gemini 2.5 Flash (6-key rotation) |
| OpenMetadata | v1.12.4 — REST APIs + AI SDK + MCP tools |
| Local stack | OpenMetadata + MySQL + Elasticsearch + Ingestion |
| Deployment | Docker Compose |

---

## Project Structure

```
MetaFlow/
├── backend/
│   ├── app/
│   │   ├── agents/        # Specialist definitions, prompts, LangGraph orchestrator
│   │   ├── core/          # Config, contracts, governance, steward, remediation
│   │   ├── playbooks/     # Registry and executor
│   │   ├── tools/         # GitHub, Slack, Google, Email, Jira, Notion, OM tools
│   │   ├── main.py        # FastAPI app — 43 routes
│   │   └── schemas.py     # Pydantic schemas
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # UI pages (Chat, Contract, Governance, Steward, …)
│   │   ├── lib/           # API client, shared types
│   │   └── App.tsx        # App shell with live incident badge
│   └── Dockerfile
├── mcp_contrib/
│   └── om_apply_health_score.json
├── docker-compose.yml
└── seed.ps1
```

---

## License

MIT — see [LICENSE](LICENSE)
