# MetaFlow

> **A reference implementation of writeback-capable AI agents for OpenMetadata.**
> We contributed a new MCP tool spec ([`mcp_contrib/`](mcp_contrib/)), an AI Studio Persona publisher, and a self-healing Data Contracts pattern — and shipped a UI to prove it works end-to-end.

> 🎬 **30-second pitch:** _link your demo video here_

> Built for the [OpenMetadata Hackathon](https://github.com/open-metadata/OpenMetadata/issues/26645) — **Pick #2: Multi-MCP Agent Orchestrator** (Track T-01: MCP Ecosystem & AI Agents)

---

## 🛠 What we contributed back to OpenMetadata

This is the part Nick called out on the hackathon Slack — _"a great idea for the hackathon is taking those tools, adding to them, building on top of them."_ Our contributions live in [`mcp_contrib/`](mcp_contrib/) and are wired into a working backend:

| Contribution | Lives in | Reference impl |
|---|---|---|
| **`om_apply_health_score`** — MCP tool spec for autonomous agents to score OM entities and write the score back as a native custom property | [`mcp_contrib/om_apply_health_score.json`](mcp_contrib/om_apply_health_score.json) | [`backend/app/core/governance.py`](backend/app/core/governance.py) → `write_health_score` |
| **AI Studio Persona publisher** — pushes 12 MetaFlow specialists into OM's native Persona registry (`client.personas.upsert`) so agents appear alongside OM's own | [`backend/app/core/personas.py`](backend/app/core/personas.py) | `POST /api/personas/publish` |
| **Self-healing Data Contracts pattern** — generates OM 1.12 contracts from lineage + profiler stats, materializes every gate as a real `dataQuality/testCases` POST, and AI-classifies failures into ready-to-merge SQL fixes | [`backend/app/core/contracts.py`](backend/app/core/contracts.py) | `POST /api/reliability/contract/heal` |

We're framing this as a **contribution to the MCP ecosystem**, not just an app on top of it.

---

## 🏆 Three things that win the demo

### 1. Self-healing Data Contracts (the OM 1.12 flagship feature, used end-to-end)
Walk a table's lineage and profiler stats → generate a full **OM 1.12 Data Contract** with all six dimensional-validation dimensions tagged → materialize every gate as a real `dataQuality/testCases` POST → when violated, AI classifies the failure (null spike / unique break / regex / range / row-count drift), drafts the SQL fix, and produces a **ready-to-merge GitHub PR description** with the exact dbt files to edit.

> `POST /api/reliability/contract` · `/publish` · `/create-tests` · `/heal`

### 2. Continuous Steward → writes health scores back to OpenMetadata
A background asyncio loop polls `/api/v1/events`, classifies every change event, and PATCHes a **`metaflow_health_score` custom property** onto the affected table. Open OM's native UI → the table page → Custom Properties panel → MetaFlow's verdict is sitting right there alongside the table's own metadata. **No other team's demo will have OM's own UI in it.**

> `POST /api/steward/start` · `GET /api/steward/digest` · `POST /api/governance/health-score`

### 3. One-flag Judge Mode against the real public sandbox
`JUDGE_MODE=true docker compose up` → MetaFlow points at `https://sandbox.open-metadata.org`, auto-enables the Steward, and protects the shared sandbox with **dry-run writes** (so judges see exactly what would be PATCHed without polluting other people's view). One curl proves it all works:

```bash
curl http://localhost:8000/api/system/judge-check | jq
# → list of 9 checks (OM reachable, auth, LLM, orchestrator, schema-drift,
#   metrics scan, health-score writeback dry-run, steward, mcp_contrib)
```

---

## 🚀 Quick start

### Judge Mode (zero config — runs against the real public sandbox)

```bash
# Set your OM sandbox PAT (login at sandbox.open-metadata.org → profile → Access Tokens)
export OM_TOKEN=eyJraWQ...
export GOOGLE_API_KEY=your-gemini-key   # free at aistudio.google.com/apikey

JUDGE_MODE=true docker compose up

# 1. Confirm everything is wired (the FIRST thing a judge should run)
curl http://localhost:8000/api/system/judge-check | jq

# 2. The headline — generate a self-healing contract
curl http://localhost:8000/api/reliability/contract?entity_fqn=sample_data.ecommerce_db.shopify.dim_customer

# 3. Schema-drift timeline (answers the org's live audience question)
curl "http://localhost:8000/api/governance/schema-drift?entity_fqn=sample_data.ecommerce_db.shopify.dim_customer"

# 4. Hard numbers from the real catalog
curl http://localhost:8000/api/metrics/scan

# 5. Watch the Steward fill its digest (auto-started in Judge Mode)
sleep 90 && curl http://localhost:8000/api/steward/digest
```

Open http://localhost:5173 → click **Contract Copilot** in the sidebar.

> 💡 **Sandbox protection:** when Judge Mode is pointed at the public sandbox, write operations (health-score PATCH, custom-property registration) become **dry-runs** — the response shows what *would* have been PATCHed, with full URL and payload, but doesn't actually mutate shared data. To run for real against your own OM, set `JUDGE_DRY_RUN=false` (or just don't use `JUDGE_MODE`).

### Demo Mode (no OM, no network)

```bash
DEMO_MODE=true STEWARD_ENABLED=true docker compose up
# Every external integration short-circuits to deterministic fixtures —
# the demo can never fail on a flaky webhook mid-pitch.
```

---

## 📋 Hackathon wishlist alignment

This submission directly addresses items the OM team has called out:

- **Schema-drift dashboard** (live audience question in the org talk) → `/api/governance/schema-drift`
- **MCP tool extensions** (Nick's #1 call-out) → contributed [`om_apply_health_score`](mcp_contrib/) manifest
- **Custom-property writeback** (audience question on custom attributes) → `metaflow_health_score` written by the Steward
- **Search-preference-aware AI** (audience question on boost/verify) → `om_get_search_preferences` + `om_search_with_preferences`
- **Bulk lineage authoring** (Nick's closing Claude-demo parallel) → `bulk-lineage-from-query-logs` playbook

---

<details>
<summary>📚 <b>More features (the supporting cast)</b></summary>

The three headlines above are what we'll demo. The features below are real and shipped, but they're supporting cast — open this section if you want to see how deep the rest of the platform goes.

- **One supervisor across 7 platforms** — LangGraph orchestrator delegates to 12 specialists across OpenMetadata, GitHub, Slack, Google, Email, Jira, and Notion (14 playbooks total).
- **Real-data metrics scan** — `/api/metrics/scan` returns hard numbers (PII gaps, contract coverage %, DQ pass rate, ownership %) instead of screenshots.
- **"Right answer in fewest tokens"** — `/api/metrics/efficiency` shows a live counter of tokens NOT sent to the LLM thanks to OM-native filtering. Direct response to OM's framing as the way to manage AI spend.
- **AI Studio Persona publishing** — `POST /api/personas/publish` upserts every MetaFlow specialist into OM as a native Persona via `client.personas.upsert`. Falls back to a local registry on older OM builds.
- **OAuth 2.0 client-credentials with auto-refresh** — set `OM_OAUTH_*` to swap the long-lived PAT for short-lived OAuth tokens (Okta / Auth0 / Keycloak / Google). All OM calls go through `build_auth_headers()` so it's a config-only flip. `GET /api/system/auth` proves it.
- **Server-side multi-turn conversations** — `USE_AI_SDK_CONVERSATIONS=true` moves chat history from local SQLite into OM via the AI SDK's Conversations API. Falls back transparently if the connected build predates it.
- **Virtual OM connector export** — `GET /api/connector/export` frames MetaFlow's outputs in an OM-ingestion envelope, so downstream pipelines can consume our autonomous decisions as a metadata source.
- **Webhook auto-triage** — `POST /api/webhooks/openmetadata` auto-routes DQ failures into the DQ Fire Drill playbook and schema changes into Impact Radar.

</details>

---

## 🧭 Mapped to OpenMetadata's three pillars

| Pillar | What MetaFlow contributes | Endpoints / Tools |
|---|---|---|
| **🔎 Data Discovery** | `semantic_search`-first prompt, "right answer in fewest tokens" filtering, OM search-preference aware | `chat`, `om_search_with_preferences` |
| **📡 Data Observability** | Self-healing OM 1.12 Data Contracts, schema-drift timeline from native `versions/` API, Continuous Steward on `/api/v1/events` | `/api/reliability/contract`, `/api/governance/schema-drift`, `/api/steward/*` |
| **🛡️ Data Governance** | Autonomous PII tagging + glossary creation. Every Steward scan **PATCHes a `metaflow_health_score` custom property back to the entity in OM** — visible in OM's UI. | `/api/governance/health-score`, `om_governance_tools` |



---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            React Frontend                                │
│   ┌──────────────┐   ┌─────────────────────────────────────────────────┐ │
│   │  Chat Panel   │   │              Playbook Runner                   │ │
│   │  (free-form)  │   │  Impact | PII | DQ | Health | DQ+Notify       │ │
│   │  + Reasoning  │   │  PII+Track | DQ+Sheet | AuditDoc | Jira+Email │ │
│   │  Timeline     │   │  Lineage+Notion | Incident | DQ Recommender   │ │
│   │               │   │  Platform Health KPI                          │ │
│   └──────┬───────┘   └──────────────────┬──────────────────────────── │ │
│          │          SSE Streaming        │                              │
└──────────┼──────────────────────────────┼──────────────────────────────┘
           │                              │
┌──────────┼──────────────────────────────┼──────────────────────────────┐
│          ▼        FastAPI Backend       ▼                              │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │         LangGraph Supervisor Orchestrator (12 agents)          │  │
│   │                                                                │  │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│   │  │Discovery │ │ Lineage  │ │ Curator  │ │  DQ      │         │  │
│   │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │         │  │
│   │  │ search   │ │ trace    │ │ patch    │ │ RCA      │         │  │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │  │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│   │  │Governance│ │ GitHub   │ │  Slack   │ │ Google   │         │  │
│   │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │         │  │
│   │  │ tags     │ │ issues   │ │ alerts   │ │ sheets   │         │  │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │  │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│   │  │ Email    │ │  Jira    │ │ Notion   │ │Insights  │         │  │
│   │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │         │  │
│   │  │ SMTP     │ │ tickets  │ │ pages    │ │ KPIs     │         │  │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │  │
│   └──────┬──────────┬──────────┬──────────┬──────┬──────┬────────┘  │
│          │          │          │          │      │      │            │
└──────────┼──────────┼──────────┼──────────┼──────┼──────┼────────────┘
           │          │          │          │      │      │
  ┌────────▼───────┐ ┌▼─────────▼┐ ┌───────▼──┐ ┌▼─────┐│┌──────┐┌──────┐
  │ OpenMetadata   │ │ GitHub    │ │ Slack    │ │Google│││ Jira ││Notion│
  │ MCP Server     │ │ REST API  │ │ Webhooks │ │  API ││└──────┘└──────┘
  │ 11 MCP Tools   │ │ Issues    │ │ Block Kit│ │Sheets││  ┌──────┐
  │ + 5 REST tools │ │ Gists     │ │ Messages │ │ Docs ││  │Email │
  │ /mcp endpoint  │ │           │ │          │ │      ││  │ SMTP │
  └────────────────┘ └───────────┘ └──────────┘ └──────┘│  └──────┘
```

## Why Multi-MCP?

The hackathon challenge asks: *"Combine OpenMetadata MCP with GitHub MCP, Slack MCP for cross-platform workflows."*

MetaFlow answers this by orchestrating **seven platforms** through a single LangGraph supervisor:

1. **OpenMetadata MCP** — Metadata discovery, lineage, governance, DQ testing (11 MCP tools + 5 REST API analytics tools)
2. **GitHub API** — Create issues, publish gist reports, search existing issues (3 tools)
3. **Slack Webhooks** — Team notifications with rich Block Kit formatting (2 tools)
4. **Google Workspace** — Sheets for tabular reports, Docs for narrative documents (3 tools)
5. **Email (SMTP)** — Alert emails and detailed HTML report delivery (2 tools)
6. **Jira** — Issue tracking, comments, JQL search (3 tools)
7. **Notion** — Page creation and block management (2 tools)

**Cross-platform workflow examples:**
> "Find failed DQ tests, create a GitHub issue, and notify Slack"
>
> → `data_quality_agent` scans via OM MCP → `github_agent` creates issue → `slack_agent` posts alert

> "Audit metadata health, create a Google Sheet report, and alert the team"
>
> → `discovery_agent` audits → `google_agent` creates spreadsheet → `slack_agent` posts alert

---

## How It Works

A single natural language message triggers a multi-agent, multi-platform workflow. Here's what happens under the hood when you type a real request:

### Workflow: "Find failed data quality tests, create a Jira ticket, and email the data team"

```
  YOU                          MetaFlow                              External Services
   │                              │                                        │
   │  "Find failed DQ tests,     │                                        │
   │   create Jira ticket,       │                                        │
   │   email the data team"      │                                        │
   │ ────────────────────────►   │                                        │
   │                              │                                        │
   │    ┌─ STEP 1 ───────────────┤                                        │
   │    │ Supervisor routes to    │                                        │
   │    │ data_quality_agent      │                                        │
   │    │                         │  get_test_definitions()                │
   │    │                         │ ──────────────────────────────────►   │
   │    │                         │          OpenMetadata MCP              │
   │    │                         │ ◄──────────────────────────────────   │
   │    │                         │  root_cause_analysis()                 │
   │    │                         │ ──────────────────────────────────►   │
   │    │                         │ ◄──────────────────────────────────   │
   │  ◄─ SSE: agent_start        │  Found: 3 failing tests on            │
   │    "Data Quality"            │  orders.amount (null rate 23%)        │
   │                              │                                        │
   │    ┌─ STEP 2 ───────────────┤                                        │
   │    │ Supervisor routes to    │                                        │
   │    │ jira_agent              │                                        │
   │    │                         │  create_jira_issue()                   │
   │    │                         │ ──────────────────────────────────►   │
   │    │                         │              Jira REST API             │
   │    │                         │ ◄──────────────────────────────────   │
   │  ◄─ SSE: agent_start        │  Created: PROJ-1234                    │
   │    "Jira" + tool_call        │  "DQ Failure: orders.amount"          │
   │                              │                                        │
   │    ┌─ STEP 3 ───────────────┤                                        │
   │    │ Supervisor routes to    │                                        │
   │    │ email_agent             │                                        │
   │    │                         │  send_email_report()                   │
   │    │                         │ ──────────────────────────────────►   │
   │    │                         │              SMTP Server               │
   │    │                         │ ◄──────────────────────────────────   │
   │  ◄─ SSE: agent_start        │  Sent HTML report to                   │
   │    "Email" + tool_call       │  data-team@company.com                │
   │                              │                                        │
   │  ◄─ SSE: chunk              │                                        │
   │    Final summary with        │                                        │
   │    Jira link + email conf.   │                                        │
   │                              │                                        │
```

**What the user sees in real time:**

```
┌─────────────────────────────────────────────────┐
│  Reasoning                                       │
│                                                  │
│  ● Data Quality          root_cause_analysis     │
│    ──────────────── done ────────────────        │
│                                                  │
│  ● Jira                  create_jira_issue       │
│    ──────────────── done ────────────────        │
│                                                  │
│  ● Email                 send_email_report       │
│    ──────────────── done ────────────────        │
│                                                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  I found 3 failing data quality tests on the     │
│  `orders.amount` column:                         │
│                                                  │
│  - **Null rate**: 23% (threshold: 5%)            │
│  - **Root cause**: Upstream ETL job dropped       │
│    the NOT NULL constraint on 2025-04-01         │
│                                                  │
│  Actions taken:                                   │
│  - Created Jira ticket **PROJ-1234**             │
│  - Emailed HTML report to data-team@company.com  │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- The **LangGraph supervisor** decides which agents to call and in what order — the user never picks agents manually
- Each agent transition streams as an **SSE event**, so the UI shows a live reasoning timeline
- The supervisor can call **1 agent or 5 agents** depending on what the request needs — simple lookups use 1, cross-platform workflows chain many
- All agent outputs feed back to the supervisor, which composes a **single coherent final response**

---

## Features

### 12 Specialist Agents (Multi-MCP)

| Agent | Platform | Tools | Purpose |
|-------|----------|-------|---------|
| **Discovery** | OpenMetadata MCP | `semantic_search`, `search_metadata`, `get_entity_details` | Find and describe data assets |
| **Lineage** | OpenMetadata MCP | `get_entity_lineage`, `get_entity_details` | Trace data flow and dependencies |
| **Curator** | OpenMetadata MCP | `get_entity_details`, `patch_entity`, `create_glossary_term` | Enrich metadata, fix documentation |
| **Data Quality** | OpenMetadata MCP | `get_test_definitions`, `create_test_case`, `root_cause_analysis`, `get_entity_details` | DQ tests, failure diagnosis, impact-scored RCA |
| **Governance** | OpenMetadata MCP | `search_metadata`, `semantic_search`, `get_entity_details`, `patch_entity`, `create_glossary`, `create_glossary_term` | Compliance, PII tagging, glossaries |
| **Insights** | OpenMetadata REST API | `get_data_insights_summary`, `get_entity_counts`, `get_dq_summary`, `get_ownership_coverage`, `get_description_coverage` | Platform analytics, KPI tracking, health reports |
| **GitHub** | GitHub REST API | `create_github_issue`, `create_github_gist`, `search_github_issues` | Issue tracking, report publishing |
| **Slack** | Slack Webhooks | `send_slack_notification`, `send_slack_alert` | Team alerts with severity formatting |
| **Google** | Google Workspace | `create_google_sheet`, `create_google_doc`, `append_to_google_sheet` | Sheets reports, Doc publications |
| **Email** | SMTP | `send_email_alert`, `send_email_report` | Alert emails & HTML reports |
| **Jira** | Jira REST API | `create_jira_issue`, `add_jira_comment`, `search_jira_issues` | Issue tracking & JQL search |
| **Notion** | Notion API | `create_notion_page`, `append_notion_blocks` | Documentation pages & blocks |

### 13 Playbooks (4 Core + 4 Cross-Platform + 3 Mega-Workflows + 2 AI-Powered)

**Core Playbooks (OpenMetadata only):**
- **Impact Radar** — Analyze blast radius of schema changes via lineage
- **PII Compliance Sweep** — Scan and tag PII across the catalog
- **Data Quality Fire Drill** — Root cause analysis + downstream impact
- **Metadata Health Doctor** — Audit and auto-fix metadata gaps

**Cross-Platform Playbooks (OM + GitHub + Slack + Google):**
- **DQ Report & Notify** — Find DQ failures -> publish GitHub gist -> alert Slack
- **PII Compliance & Track** — Scan PII -> tag tables -> create GitHub issue -> notify Slack
- **DQ Sheet & Alert** — Find DQ failures -> create Google Sheet report -> alert Slack
- **Metadata Audit Doc** — Audit metadata -> publish Google Doc -> create GitHub issue -> notify Slack

**Mega-Workflows (OM + Jira + Email + Notion):**
- **DQ Jira & Email** — Find DQ failures -> create Jira ticket -> send email report
- **Lineage Notion & Jira** — Trace lineage -> document in Notion -> create Jira tracking issue
- **Full Incident Response** — DQ failure -> GitHub issue + Slack alert + Jira ticket + email report + Notion doc

**AI-Powered Analytics (Insights Agent + OM REST API):**
- **DQ Test Recommender** — Analyze table schema & data profile -> recommend DQ tests -> auto-create test cases
- **Platform Health & KPI Report** — Gather entity counts, ownership/description coverage, DQ summary -> generate executive KPI report

### Free-Form Chat with Live Agent Reasoning
Natural language interface that automatically routes questions to the right specialist. The UI shows **real-time agent reasoning** — which specialist is active, which tools are being called — as the orchestrator works.

### Real-Time Streaming
Server-Sent Events (SSE) for live agent reasoning timeline and step-by-step playbook progress.

### Conversation History with Resume
All conversations are persisted. Browse past chats and **continue any conversation** right where you left off.

### Rich Health Check
The `/health` endpoint checks orchestrator status, LLM availability, and OpenMetadata connectivity — returning component-level health for monitoring.

### Dual LLM Support
Switch between **Google Gemini** and **OpenAI** models on the fly via the Settings page. API keys managed securely in-app.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Orchestration** | LangGraph + langgraph-supervisor |
| **MCP Integration** | OpenMetadata AI SDK (`data-ai-sdk[langchain]`) |
| **LLM** | Google Gemini 2.5 Flash / OpenAI GPT-4o (switchable) |
| **Backend** | FastAPI + SSE-Starlette |
| **Frontend** | React 19 + TypeScript + Tailwind CSS |
| **Cross-Platform** | GitHub + Slack + Google Workspace + Email + Jira + Notion |
| **Deployment** | Docker Compose (OpenMetadata v1.12.4) |

## Quick Start

### Prerequisites
- Docker & Docker Compose (6GB+ RAM allocated)
- Google AI API key (free at https://aistudio.google.com/apikey)
- OpenMetadata PAT token (generated after first login)
- *(Optional)* GitHub personal access token for GitHub agent
- *(Optional)* Slack webhook URL for Slack agent
- *(Optional)* Google Cloud Service Account JSON for Google agent

### 1. Clone and configure

```bash
git clone <repo-url> && cd metaflow
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
# Required
GOOGLE_API_KEY=your-gemini-api-key
OM_HOST=http://openmetadata-server:8585
OM_TOKEN=your-personal-access-token

# Optional — Multi-MCP integrations
GITHUB_TOKEN=ghp_your_github_pat
GITHUB_DEFAULT_REPO=owner/repo
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
GOOGLE_SERVICE_ACCOUNT_FILE=path/to/service-account.json
```

### 2. Start everything

```bash
docker compose up -d
```

This starts:
- **OpenMetadata** at http://localhost:8585 (admin / admin)
- **MetaFlow Backend** at http://localhost:8000
- **MetaFlow Frontend** at http://localhost:3000

### 3. Set up OpenMetadata MCP

1. Log into OpenMetadata at http://localhost:8585
2. Go to **Settings → Applications → Marketplace**
3. Install the **MCP Application**
4. Go to your **user profile → Access Tokens** and create a Personal Access Token
5. Add the token to `backend/.env` as `OM_TOKEN`
6. Run sample data ingestion from **Settings → Bots** for demo data

### 4. Restart MetaFlow

```bash
docker compose restart backend
```

### Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e ".[dev]"
cp .env.example .env          # configure your keys
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Project Structure

```
metaflow/
├── docker-compose.yml              # Full-stack: OM 1.12.4 + MetaFlow
├── om-docker-compose.yml           # Reference official OM compose
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py                 # FastAPI app with SSE endpoints
│   │   ├── schemas.py              # Pydantic request/response models
│   │   ├── core/
│   │   │   ├── config.py           # Settings from env vars
│   │   │   └── clients.py          # AI SDK + LLM singletons
│   │   ├── agents/
│   │   │   ├── prompts.py          # System prompts (12 agents + supervisor)
│   │   │   ├── specialists.py      # Specialist agent factory
│   │   │   └── orchestrator.py     # LangGraph multi-MCP supervisor
│   │   ├── tools/                  # Cross-platform tool modules
│   │   │   ├── github_tools.py     # GitHub REST API tools (3)
│   │   │   ├── slack_tools.py      # Slack webhook tools (2)
│   │   │   ├── google_tools.py     # Google Workspace tools (3)
│   │   │   ├── email_tools.py      # Email SMTP tools (2)
│   │   │   ├── jira_tools.py       # Jira REST API tools (3)
│   │   │   ├── notion_tools.py     # Notion API tools (2)
│   │   │   └── insights_tools.py   # OM REST API analytics tools (5)
│   │   ├── core/
│   │   │   ├── config.py           # Settings from env vars
│   │   │   ├── clients.py          # AI SDK + LLM singletons
│   │   │   └── stats.py            # Agent usage statistics
│   │   └── playbooks/
│   │       ├── registry.py         # 13 playbook definitions
│   │       └── executor.py         # Step-by-step playbook runner
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── ChatPanel.tsx
│       │   ├── PlaybookGallery.tsx
│       │   ├── PlaybookRunner.tsx
│       │   ├── ConversationHistory.tsx
│       │   ├── SettingsPage.tsx
│       │   └── Dashboard.tsx
│       └── lib/
│           ├── api.ts
│           └── types.ts
```

## OpenMetadata MCP Tools Used

All 11 MCP tools from OpenMetadata's AI SDK are utilized across the agents:

| Tool | Type | Used By |
|------|------|---------|
| `SEARCH_METADATA` | Read | Discovery, Governance |
| `SEMANTIC_SEARCH` | Read | Discovery, Governance |
| `GET_ENTITY_DETAILS` | Read | All OM agents |
| `GET_ENTITY_LINEAGE` | Read | Lineage |
| `GET_TEST_DEFINITIONS` | Read | Data Quality |
| `PATCH_ENTITY` | Write | Curator, Governance |
| `CREATE_GLOSSARY` | Write | Governance |
| `CREATE_GLOSSARY_TERM` | Write | Curator, Governance |
| `CREATE_LINEAGE` | Write | (Available for chains) |
| `CREATE_TEST_CASE` | Write | Data Quality |
| `ROOT_CAUSE_ANALYSIS` | AI | Data Quality |

## Cross-Platform & Analytics Tools

| Tool | Platform | Parameters |
|------|----------|------------|
| `create_github_issue` | GitHub | title, body, labels |
| `create_github_gist` | GitHub | description, filename, content |
| `search_github_issues` | GitHub | query, state |
| `send_slack_notification` | Slack | message |
| `send_slack_alert` | Slack | title, summary, severity, details, link |
| `create_google_sheet` | Google Workspace | title, headers, rows |
| `create_google_doc` | Google Workspace | title, content |
| `append_to_google_sheet` | Google Workspace | spreadsheet_id, rows |
| `send_email_alert` | Email (SMTP) | to, subject, body |
| `send_email_report` | Email (SMTP) | to, subject, html_body |
| `create_jira_issue` | Jira | summary, description, issue_type |
| `add_jira_comment` | Jira | issue_key, comment |
| `search_jira_issues` | Jira | jql_query |
| `create_notion_page` | Notion | title, content |
| `append_notion_blocks` | Notion | page_id, blocks |
| `get_data_insights_summary` | OpenMetadata REST | *(none)* |
| `get_entity_counts` | OpenMetadata REST | *(none)* |
| `get_dq_summary` | OpenMetadata REST | *(none)* |
| `get_ownership_coverage` | OpenMetadata REST | entity_type |
| `get_description_coverage` | OpenMetadata REST | entity_type |

## Hackathon Alignment

### Pick #2: Multi-MCP Agent Orchestrator
> *"Combine OpenMetadata MCP with GitHub MCP, Slack MCP for cross-platform workflows"*

MetaFlow directly addresses this by:
- Orchestrating **7 platforms** (OpenMetadata MCP + GitHub + Slack + Google Workspace + Email + Jira + Notion) in a single supervisor
- **12 specialist agents** with domain-specific tool assignments
- **Cross-platform playbooks** that chain operations across all 7 platforms
- A **natural language router** that decides which agents to invoke
- **Live agent reasoning** visible in the UI as the orchestrator works
- **AI-powered analytics**: DQ Test Recommender + Platform Health KPI reports via OM REST API
- **Impact-scored RCA**: Data Quality agent produces severity × downstream × recency scoring
- **Webhook auto-triage**: OM webhooks auto-trigger playbooks on DQ failures and schema changes

### Tracks Covered
- **T-01: MCP Ecosystem & AI Agents** (Primary) — Full multi-agent, multi-MCP orchestration
- **T-02: Data Quality & Observability** — DQ Fire Drill, DQ Report & Notify, DQ Test Recommender, impact-scored RCA
- **T-04: Metadata & AI Integration** — Insights agent with platform analytics, KPI tracking
- **T-05: Documentation & Developer Tools** — Metadata Health Doctor auto-docs
- **T-06: Open Innovation** — Cross-platform playbook-based metadata ops, webhook auto-trigger

## License

MIT
