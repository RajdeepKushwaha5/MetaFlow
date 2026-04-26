# MetaFlow

MetaFlow is a multi-agent AI control plane for OpenMetadata.

It helps data teams move from passive metadata and alerting to governed, reviewable, self-healing data operations. OpenMetadata remains the system of record. MetaFlow reads from it, reasons over it, writes governance signals back into it, and coordinates specialist agents across operational tools.

The project was built for the OpenMetadata Hackathon, with the primary focus on multi-agent orchestration, OpenMetadata MCP, AI-assisted data contracts, governance write-back, and production-style metadata operations.

## The Problem

Modern data teams already have catalogs, lineage graphs, quality tests, incident tools, and chat systems. The hard part is that these systems usually remain disconnected.

When a data problem happens, teams often receive an alert such as:

```text
customer_id null rate exceeded threshold
```

That alert alone is not enough. It usually does not know:

- which OpenMetadata table is affected
- which contract expectation failed
- which upstream source caused the issue
- which dashboards or downstream assets are at risk
- who owns the table
- whether the columns are sensitive
- what governance action should be written back
- what engineering remediation should be drafted
- whether the same issue already has a GitHub or Jira ticket

The result is manual incident handling. Engineers jump between OpenMetadata, dashboards, Slack, GitHub, Jira, SQL files, runbooks, and documentation. The metadata exists, but the operational action is still manual.

## The MetaFlow Solution

MetaFlow turns OpenMetadata into the control plane for AI-assisted data operations.

Instead of treating OpenMetadata as only a catalog to inspect, MetaFlow treats it as the source of truth for decisions and write-backs. It uses OpenMetadata metadata to power specialist agents that can:

- discover and summarize real data assets
- inspect lineage and downstream impact
- generate OpenMetadata-native data contracts
- publish data contracts back to OpenMetadata
- materialize contract gates as OpenMetadata test cases
- classify contract violations
- draft SQL or dbt remediation plans
- write governance health scores back as custom properties
- patch descriptions and glossary metadata
- monitor the catalog continuously
- publish AI personas into OpenMetadata
- coordinate GitHub, Slack, Google Workspace, Email, Jira, and Notion workflows

The design principle is simple:

```text
AI can propose actions, but OpenMetadata remains the governed system of record.
```

## What MetaFlow Demonstrates

MetaFlow is not just a chat interface. It is a working full-stack system with:

- a React frontend for operators
- a FastAPI backend
- a LangGraph supervisor orchestrating specialist agents
- OpenMetadata v1.12.4 running locally through Docker Compose
- MySQL, Elasticsearch, and OpenMetadata ingestion services
- OpenMetadata REST and MCP-style tool usage
- deterministic production verification endpoints
- optional external integrations for collaboration workflows

The default local demo entity is:

```text
sample_db_service.ecommerce_db.shopify.dim_customer
```

This table is used across the contract, governance, steward, playbook, and judge-check flows.

## Core Features

### 1. Data Contract Copilot

Contract Copilot is the flagship workflow.

It takes an OpenMetadata table FQN and generates a data contract using live metadata context. For the sample `dim_customer` table, it produces:

- schema expectations
- required fields
- allowed values
- email format checks
- null-rate expectations
- uniqueness expectations
- row-count or volume expectations
- freshness and availability-style SLA metadata
- lineage source context

The contract can then be published back to OpenMetadata as a native data contract.

Main endpoints:

```text
GET  /api/reliability/contract
POST /api/reliability/contract/publish
GET  /api/reliability/contract/status
POST /api/reliability/contract/create-tests
POST /api/reliability/contract/heal
```

Example:

```text
http://localhost:8000/api/reliability/contract?entity_fqn=sample_db_service.ecommerce_db.shopify.dim_customer
```

Expected output includes:

- `demo=false`
- a generated contract object
- YAML representation
- quality gates
- stats such as upstream sources, columns analyzed, and schema expectations

### 2. Quality Gate Materialization

MetaFlow converts generated contract gates into OpenMetadata test cases.

Example gates include:

- `columnValuesToBeNotNull`
- `columnValuesToBeUnique`
- `columnValuesToMatchRegex`
- `columnValuesToBeInSet`
- `tableRowCountToBeBetween`

If a test case already exists, MetaFlow skips it instead of duplicating it. This makes the flow idempotent and suitable for repeated demos or production-style workflows.

The important success condition is:

```text
failed = 0
```

### 3. Self-Healing Remediation Drafts

When a contract violation is described, MetaFlow classifies the failure and drafts a remediation plan.

Example violation:

```text
Null rate on customer_id exceeded threshold (0.6% > 0.1%)
```

MetaFlow returns:

- classification, such as `null`
- SQL or dbt-oriented fix guidance
- likely file paths to inspect
- a PR-style title
- a structured PR body
- labels such as `contract-violation` and `metaflow`

This flow intentionally drafts the remediation. It does not blindly open a pull request or push code. The generated output is meant to be reviewed by an engineer.

### 4. Governance Write-Back

MetaFlow proves that it can write governed metadata back into OpenMetadata.

The Governance Agent can calculate a health score for an entity and PATCH it back into OpenMetadata as a custom property:

```text
metaflow_health_score
```

This score is visible on the native OpenMetadata table page under Custom Properties.

Related capabilities:

- health score write-back
- description patching
- glossary creation
- glossary term creation
- tag and owner style governance operations through OpenMetadata tooling

Main endpoints:

```text
POST /api/governance/health-score
POST /api/governance/description
POST /api/governance/glossary
GET  /api/governance/schema-drift
```

### 5. Schema Drift Timeline

MetaFlow reads OpenMetadata entity version history and turns it into a schema drift timeline.

Example:

```text
http://localhost:8000/api/governance/schema-drift?entity_fqn=sample_db_service.ecommerce_db.shopify.dim_customer
```

This helps operators understand what changed, when it changed, and how that change relates to governance or reliability risk.

### 6. Continuous Steward

The Continuous Steward is a background monitoring loop.

It polls OpenMetadata for signals such as:

- metadata changes
- quality signals
- contract evidence
- governance gaps
- table-level health indicators

It maintains a live state and digest that can be viewed from the UI or through the backend.

Main endpoints:

```text
GET  /api/steward/state
GET  /api/steward/digest
POST /api/steward/start
POST /api/steward/stop
```

This shows that MetaFlow is not limited to button-click automation. It can continuously watch the metadata system and prepare operational next actions.

### 7. Multi-Agent Chat

MetaFlow includes a natural-language chat interface backed by a LangGraph supervisor.

The supervisor routes user requests to specialist agents. The UI streams reasoning and tool activity so the operator can see which agent is working and why.

Example prompt:

```text
Find tables with failing DQ tests and summarize the next action in 3 bullets.
```

The chat system is designed for operational questions over OpenMetadata and connected tools. It is not meant to be a generic chatbot detached from metadata.

### 8. Playbooks

Playbooks provide repeatable workflows for common data operations.

Examples include:

- impact analysis
- PII compliance sweep
- data quality fire drill
- metadata health review
- contract copilot workflow
- incident response
- platform KPI reporting
- bulk lineage authoring
- cross-platform notification and ticketing

Playbooks stream step-by-step progress so an operator can follow what the system is doing.

Main endpoints:

```text
GET  /api/playbooks
POST /api/playbooks/run
```

### 9. Personas

MetaFlow can publish its specialist agents into OpenMetadata as Personas where supported.

This is important because the agents themselves become cataloged and governed. They are not just hidden backend code. They are part of the metadata operating model.

Main endpoints:

```text
GET  /api/personas
POST /api/personas/publish
POST /api/personas/{persona_name}/invoke
```

### 10. Metrics And Platform Insights

MetaFlow includes metrics and insights endpoints for platform-level reporting.

Examples:

```text
GET /api/metrics/scan
GET /api/metrics/efficiency
POST /api/metrics/efficiency/probe
```

These flows summarize OpenMetadata coverage and operational health indicators such as ownership, descriptions, quality, and efficiency.

### 11. Webhook Auto-Triage

MetaFlow can receive OpenMetadata webhook payloads and route them into the correct workflow.

Main endpoint:

```text
POST /api/webhooks/openmetadata
```

Example use cases:

- data quality failure triggers a data quality fire drill
- schema change triggers impact analysis
- contract violation triggers remediation drafting

### 12. GitHub, Slack, Google, Email, Jira, And Notion Integrations

MetaFlow includes optional tool integrations for cross-platform workflows.

Supported integration families:

- GitHub issues, gists, and issue search
- Slack notifications and alerts
- Google Sheets and Docs
- Email alerts and HTML reports through SMTP
- Jira issues, comments, and search
- Notion pages and block updates

These tools are optional. If credentials are not configured, the core OpenMetadata workflows still work.

## OpenMetadata Contributions And Extension Points

MetaFlow includes contribution-oriented work in addition to the application itself.

### MCP Tool Spec: `om_apply_health_score`

Location:

```text
mcp_contrib/om_apply_health_score.json
```

Purpose:

This tool describes how an autonomous agent can write a health score and per-dimension breakdown back to an OpenMetadata entity as a native custom property.

Reference implementation:

```text
backend/app/core/governance.py
```

### AI Studio Persona Publisher

Location:

```text
backend/app/core/personas.py
```

Purpose:

Publishes MetaFlow specialists into OpenMetadata as Personas when the connected OpenMetadata build supports it.

### Self-Healing Data Contracts Pattern

Location:

```text
backend/app/core/contracts.py
```

Purpose:

Shows how to generate contracts, publish them to OpenMetadata, materialize quality gates as test cases, inspect contract status, and draft remediation when a violation occurs.

## Architecture

```text
React Frontend
  |
  | HTTP + SSE
  v
FastAPI Backend
  |
  | LangGraph Supervisor
  v
Specialist Agents
  |
  | OpenMetadata REST / AI SDK / MCP-style tools
  | Optional external APIs
  v
OpenMetadata + GitHub + Slack + Google + Email + Jira + Notion
```

### Runtime Components

The production Docker stack includes:

- MetaFlow frontend on port `3000`
- MetaFlow backend on port `8000`
- OpenMetadata server on port `8585`
- OpenMetadata ingestion service on port `8080`
- MySQL on port `3306`
- Elasticsearch on ports `9200` and `9300`

### Backend

The backend is a FastAPI service that provides:

- health checks
- settings and integration management
- chat orchestration
- playbook execution
- reliability APIs
- governance APIs
- steward APIs
- metrics APIs
- persona APIs
- OpenMetadata webhook handling

### Frontend

The frontend is a React and TypeScript application with pages for:

- chat
- playbooks
- contract copilot
- data reliability
- auto remediation
- governance
- steward operations
- personas
- integrations
- settings
- dashboard and overview experiences

### Agent Layer

MetaFlow uses a LangGraph supervisor to route work to specialist agents.

Specialists include:

- Discovery Agent
- Lineage Agent
- Curator Agent
- Data Quality Agent
- Governance Agent
- GitHub Agent
- Slack Agent
- Google Agent
- Email Agent
- Jira Agent
- Notion Agent
- Insights Agent
- Contract Copilot Agent

Each specialist has a focused prompt and access to the tools needed for its domain.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python |
| Streaming | Server-Sent Events |
| Agent orchestration | LangGraph, langgraph-supervisor |
| OpenMetadata integration | OpenMetadata REST APIs, AI SDK, MCP-style tool usage |
| LLM | Google Gemini by default, OpenAI and Anthropic support in code paths |
| Local metadata stack | OpenMetadata v1.12.4, MySQL, Elasticsearch, ingestion service |
| Deployment | Docker Compose |

## Important URLs

After the stack is running:

```text
MetaFlow UI:        http://localhost:3000
Backend:            http://localhost:8000
FastAPI docs:       http://localhost:8000/docs
OpenMetadata:       http://localhost:8585
OpenMetadata MyData: http://localhost:8585/my-data
```

OpenMetadata login for the seeded local stack:

```text
judge@open-metadata.org / Admin@123
```

Main demo FQN:

```text
sample_db_service.ecommerce_db.shopify.dim_customer
```

## Demo Flow

The recommended judge demo flow is:

1. Show MetaFlow UI at `http://localhost:3000`.
2. Show OpenMetadata table at `http://localhost:8585/my-data`.
3. Generate a data contract for `sample_db_service.ecommerce_db.shopify.dim_customer`.
4. Publish the contract.
5. Materialize quality gates.
6. Draft a remediation plan for a `customer_id` null-rate breach.
7. Run governance health score write-back.
8. Show `metaflow_health_score` in the OpenMetadata native UI.
9. Show Continuous Steward state.
10. Run one playbook.
11. Publish personas or run one short chat prompt.

The final demo script is in:

```text
METAFLOW_FINAL_DEMO_SCRIPT.txt
```

## Setup

### Prerequisites

Install:

- Docker Desktop
- Docker Compose
- Git

Recommended resources:

- at least 6 GB Docker memory
- stable internet connection for initial image pulls

Optional:

- Google AI Studio API key for Gemini
- GitHub token for GitHub issue creation
- Slack webhook URL
- Google service account JSON
- Jira API token
- Notion API key
- SMTP credentials

### 1. Clone The Repository

```powershell
git clone <repo-url>
cd metaflow
```

### 2. Configure Backend Environment

Create or edit:

```text
backend/.env
```

Important variables:

```env
# LLM
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GOOGLE_API_KEY=your_primary_gemini_key

# Optional Gemini key rotation. Comma-separated.
GOOGLE_API_KEYS=your_primary_gemini_key,your_second_key,your_third_key

# OpenMetadata
AI_SDK_HOST=http://openmetadata-server:8585
AI_SDK_TOKEN=your_openmetadata_token

# Production demo flags
DEMO_MODE=false
JUDGE_MODE=true
JUDGE_DRY_RUN=false
STEWARD_ENABLED=true

# Optional integrations
GITHUB_TOKEN=
GITHUB_DEFAULT_REPO=
SLACK_WEBHOOK_URL=
GOOGLE_SERVICE_ACCOUNT_FILE=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
JIRA_URL=
JIRA_USER=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

Do not commit real API keys or tokens.

### 3. Start The Full Stack

From the repository root:

```powershell
docker compose up -d --build
```

Check containers:

```powershell
docker compose ps
```

Expected containers:

- `metaflow_backend`
- `metaflow_frontend`
- `metaflow_openmetadata`
- `metaflow_mysql`
- `metaflow_elasticsearch`
- `metaflow_ingestion`

### 4. Seed Sample Data If Needed

If the sample OpenMetadata table is missing:

```powershell
.\seed.ps1
```

Expected sample table:

```text
sample_db_service.ecommerce_db.shopify.dim_customer
```

### 5. Verify Readiness

Open:

```text
http://localhost:3000
http://localhost:8585
http://localhost:8000/health
```

Verify system info:

```powershell
Invoke-RestMethod http://localhost:8000/api/system/info | ConvertTo-Json -Depth 10
```

Expected:

```text
demo_mode=false
judge_mode=true
dry_run=false
is_sandbox=false
ai_sdk_host=http://openmetadata-server:8585
has_om_token=true
```

Run judge check:

```powershell
Invoke-RestMethod "http://localhost:8000/api/system/judge-check?entity_fqn=sample_db_service.ecommerce_db.shopify.dim_customer" | ConvertTo-Json -Depth 20
```

Expected:

```text
passed=9
total=9
ok=true
```

## Useful API Endpoints

### System

```text
GET /health
GET /api/system/info
GET /api/system/judge-check
GET /api/system/auth
POST /api/system/auth/refresh
```

### Contracts And Reliability

```text
GET  /api/reliability/impact
GET  /api/reliability/cause-tree
GET  /api/reliability/recommendations
POST /api/reliability/create-test
GET  /api/reliability/auto-remediate
POST /api/reliability/dispatch-ticket
GET  /api/reliability/contract
POST /api/reliability/contract/publish
GET  /api/reliability/contract/status
POST /api/reliability/contract/create-tests
POST /api/reliability/contract/heal
```

### Governance

```text
POST /api/governance/health-score
POST /api/governance/description
POST /api/governance/glossary
GET  /api/governance/schema-drift
```

### Steward And Metrics

```text
GET  /api/steward/state
GET  /api/steward/digest
POST /api/steward/start
POST /api/steward/stop
GET  /api/metrics/scan
GET  /api/metrics/efficiency
POST /api/metrics/efficiency/probe
```

### Chat, Playbooks, Personas

```text
POST /api/chat
GET  /api/playbooks
POST /api/playbooks/run
GET  /api/personas
POST /api/personas/publish
POST /api/personas/{persona_name}/invoke
```

### Webhooks And Connector Export

```text
POST /api/webhooks/openmetadata
POST /webhooks/contract-violation
GET  /api/connector/export
```

## Local Development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend dev server usually runs on:

```text
http://localhost:5173
```

The production Docker frontend runs on:

```text
http://localhost:3000
```

## Project Structure

```text
metaflow/
  backend/
    app/
      agents/            Specialist definitions, prompts, orchestrator
      core/              Config, clients, contracts, governance, metrics, steward
      playbooks/         Playbook registry and executor
      tools/             GitHub, Slack, Google, Email, Jira, Notion, OM tools
      main.py            FastAPI application and API routes
      schemas.py         Pydantic schemas
    Dockerfile
    pyproject.toml
  frontend/
    src/
      components/        UI pages and feature components
      lib/               API client and shared frontend types
      App.tsx            Main app shell
    Dockerfile
    package.json
    vite.config.ts
  mcp_contrib/
    om_apply_health_score.json
  docker-compose.yml
  seed.ps1
  smoke_test.ps1
  test_all.ps1
  METAFLOW_FINAL_DEMO_SCRIPT.txt
```

## Testing Checklist

Before recording or submitting:

```text
[ ] docker compose ps shows all core services running.
[ ] http://localhost:3000 loads.
[ ] http://localhost:8585/my-data loads.
[ ] http://localhost:8000/health returns status ok.
[ ] /api/system/info shows demo_mode=false and dry_run=false.
[ ] /api/system/judge-check passes 9/9.
[ ] sample_db_service.ecommerce_db.shopify.dim_customer exists in OpenMetadata.
[ ] Contract Copilot generates a contract for the exact FQN.
[ ] Contract publish reports Published.
[ ] Materialize tests reports failed 0.
[ ] Remediation draft returns classification, diff, title, and labels.
[ ] Governance health score write-back succeeds.
[ ] OpenMetadata UI shows metaflow_health_score under Custom Properties.
[ ] Continuous Steward is enabled and polling.
[ ] At least one playbook completes.
[ ] Personas publish succeeds.
```

## Notes On API Keys

MetaFlow supports Gemini API key rotation through:

```env
GOOGLE_API_KEYS=key1,key2,key3
```

The backend uses `GOOGLE_API_KEY` first, then falls back to keys in `GOOGLE_API_KEYS` when Gemini returns quota or rate-limit style errors.

Do not commit real keys. If a key is pasted into a public chat, issue, commit, or demo recording, rotate it.

## License

MIT
