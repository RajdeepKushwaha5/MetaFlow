# MetaFlow

> **Semantic intelligence for OpenMetadata — human direction, AI execution.**
> A supervisor agent that turns OpenMetadata into a self-driving data platform across all three pillars: **Data Discovery · Data Observability · Data Governance**. Generates self-healing Data Contracts from lineage, runs an autonomous Data Steward 24/7, and writes its findings back into OpenMetadata as native custom properties so humans and AI agents see the same truth.

> 🎬 **30-second pitch:** _link your demo video here_

> Built for the [OpenMetadata Hackathon](https://github.com/open-metadata/OpenMetadata/issues/26645) — **Pick #2: Multi-MCP Agent Orchestrator** (Track T-01: MCP Ecosystem & AI Agents)

---

## 🧭 The framing: semantic intelligence across the three pillars

OpenMetadata's mission is _semantic intelligence_ — turning raw metadata into shared meaning that both people *and* AI agents can act on. Every MetaFlow surface maps to one of the three pillars OM ships for:

| Pillar | What MetaFlow contributes | Endpoints / Tools |
|---|---|---|
| **🔎 Data Discovery** | `semantic_search`-first discovery prompt, "right answer in fewest tokens" filtering, OM search-preference aware. Every agent starts with semantic search before any full-table scan. | `chat` (DiscoveryAgent), `om_search_with_preferences` |
| **📡 Data Observability** | Self-healing OM 1.12 Data Contracts with all six dimensions tagged. Schema-drift timeline from OM's native `versions/` API. Continuous Steward watching `/api/v1/events`. | `/api/reliability/contract` · `/api/governance/schema-drift` · `/api/steward/*` |
| **🛡️ Data Governance** | Autonomous PII tagging, owner/tier setting, glossary-term creation. Every Steward scan **writes a `metaflow.health_score` custom property back to the entity in OM** — visible in OM's native UI. | `/api/governance/health-score` · `om_governance_tools` |

**Human direction, AI execution** — exactly the pattern OpenMetadata is pushing the ecosystem toward.

---

## 🏆 Why this wins

### 1. Headline: **Self-healing Data Contracts** (OM 1.12 flagship)
- Walk a table's lineage and **profiler stats** → generate a full OM 1.12 Data Contract (`schema` / `semantics` / `qualityExpectations` / `SLA` / `owners`).
- **Materialize** every quality gate as a real `dataQuality/testCases` POST so the contract is *enforceable*, not decorative.
- Every gate is tagged with one of OM 1.12's six **dimensional-validation** dimensions — `completeness`, `uniqueness`, `validity`, `accuracy`, `consistency`, `timeliness`.
- When a contract is violated → AI **classifies** the failure (null spike / unique break / regex / range / row-count drift), drafts the **SQL fix**, and produces a ready-to-merge **GitHub PR description** including the exact dbt files to edit.

> `POST /api/reliability/contract` · `/publish` · `/create-tests` · `/heal` · `POST /webhooks/contract-violation`

### 2. The unexpected piece: **Continuous Data Steward — that writes back to OM**
A background asyncio loop polls `/api/v1/events`, classifies every change event, and takes **autonomous action**. The kicker: every scan posts a `metaflow.health_score` (0–100, with breakdown) as a **native OpenMetadata custom property** on the table — so judges who open the OM UI see *MetaFlow's verdict alongside the table's own metadata*. Flip it on with `STEWARD_ENABLED=true`, walk away, come back to a digest of what was caught, scored, and tagged.

> `POST /api/steward/start` · `GET /api/steward/state` · `GET /api/steward/digest` · `POST /api/governance/health-score`

### 3. **Schema-drift timeline** (answers the live audience question from the org talk)
A first-class `/api/governance/schema-drift?entity_fqn=...` endpoint walks OM's native `tables/{id}/versions` API and returns a clean timeline of every column add/drop/rename/type-change with timestamps and changed-by. Build a dashboard on top in one prompt.

### 4. **Real numbers, not screenshots**
`/api/metrics/scan` walks OM and returns hard numbers — total tables, columns *likely* PII but missing tags, contract coverage %, DQ pass rate, ownership/description coverage. The demo shows judges integers like _"scanned 847 tables, 23 PII gaps, auto-tagged 19, 4 flagged for review"_.

### 5. **Demo Mode** — zero-network demo
`DEMO_MODE=true` short-circuits every external integration (Slack, Jira, Notion, Google, Email, GitHub) to deterministic fixtures. Stage demo can never fail on a flaky webhook. Same code path, different return — no separate "mock" branch.

### 6. One supervisor across 7 platforms
*One LangGraph supervisor* delegates to 13 specialist skills across OpenMetadata, GitHub, Slack, Google, Email, Jira, and Notion. Impact-scored RCA, AI test recommender, 14 playbooks — all supporting cast for the headline.

### 7. **"Right answer in fewest tokens"** — measured, not claimed
Every `om_search_with_preferences` call records how many entities the agent did NOT have to feed to the LLM. Live counter at `/api/metrics/efficiency` (and a banner in the UI) shows _"14,200 tokens avoided · 8 full scans skipped · ~$0.0011 saved"_. Direct response to the org's framing of OM as the way to manage AI spend.

### 8. **Bulk lineage authoring** — the Claude-demo parallel
The org's hackathon talk closed with a Claude demo adding lineage edges across many tables in one prompt. We ship `bulk-lineage-from-query-logs` as a playbook: read OM's recorded query history, infer source→target pairs from JOIN / INSERT INTO patterns, materialize edges in one batch.

> `GET /api/connector/export` · playbook `bulk-lineage-from-query-logs`

### 9. **Judge Mode** — one flag against the real public sandbox
`JUDGE_MODE=true` overrides `AI_SDK_HOST` to `sandbox.open-metadata.org`, enables the Steward, and switches off demo fixtures. Judges can run MetaFlow against **real OpenMetadata** without configuring anything.

### 10. **Contributed back to the MCP ecosystem**
We ship a new MCP tool manifest — `om_apply_health_score` — in [`mcp_contrib/`](mcp_contrib/). Defines a canonical writeback contract for autonomous agents to score OM entities. Direct response to the org's call-out: _"a great idea for the hackathon is taking those tools, adding to them, building on top of them."_

### 11. **AI Studio Personas (publish, don't reinvent)**
`POST /api/personas/publish` walks every MetaFlow specialist (12 of them) and pushes each one into OM as an **AI Studio persona** via `client.personas.upsert(...)` — name, system prompt, default model, allowed MCP tools, all included. The agents now appear in OM's native AI Studio UI alongside the org's own personas. Falls back to a local registry if the connected SDK build predates personas, so behavior is identical for older OM versions.

> `GET /api/personas` · `POST /api/personas/publish` · `POST /api/personas/{name}/invoke`

### 12. **OAuth 2.0 client-credentials for MCP (auto-refresh)**
PATs are convenient but they're long-lived and they leak. Set `OM_OAUTH_TOKEN_URL` + `OM_OAUTH_CLIENT_ID` + `OM_OAUTH_CLIENT_SECRET` and MetaFlow runs the standard `client_credentials` grant against your OIDC provider (Okta / Auth0 / Keycloak / Google), caches the access token, and **auto-refreshes 30 seconds before expiry**. Every OM call (governance, lineage, contracts, steward, metrics, insights, native search) goes through the same `build_auth_headers()` helper, so flipping orgs from PAT → OAuth is one config change. `GET /api/system/auth` proves it's live.

### 13. **Server-side multi-turn conversations in OM**
Set `USE_AI_SDK_CONVERSATIONS=true` and chat history moves from MetaFlow's local SQLite into OM via the AI SDK's Conversations API. Other OM-aware clients (the OM UI, audit dashboards, another agent) can now read the same threads. Falls back transparently to local SQLite if the connected build predates the API — your judges never see a broken endpoint.

---

## 📋 OM hackathon wishlist alignment

We checked the [hackathon wishlist project](https://github.com/orgs/open-metadata/projects) and this submission addresses:

- **Schema-drift dashboard** (live audience question in the org talk) → `/api/governance/schema-drift`
- **Search-preference-aware AI** (audience question on boost/verify) → `om_get_search_preferences` + `om_search_with_preferences`
- **Custom-property writeback** (audience question on custom attributes) → `metaflow_health_score` written by the Steward
- **MCP tool extensions** (org's #1 call-out) → contributed `om_apply_health_score` manifest
- **Bulk lineage authoring at scale** (org's closing Claude demo) → `bulk-lineage-from-query-logs` playbook

---

## 🚀 30-second tour

```bash
# 1. Boot in demo mode (no external creds needed)
DEMO_MODE=true STEWARD_ENABLED=true docker compose up

# 2. Headline: generate + publish a self-healing contract
curl http://localhost:8000/api/reliability/contract?entity_fqn=warehouse.analytics.daily_revenue

# 3. Watch the autonomous Steward (auto-started above)
sleep 90 && curl http://localhost:8000/api/steward/digest

# 4. Schema-drift timeline (answers the org's live audience question)
curl "http://localhost:8000/api/governance/schema-drift?entity_fqn=warehouse.crm.customers"

# 5. Write a MetaFlow health score back to OM as a native custom property
curl -X POST http://localhost:8000/api/governance/health-score \
  -H 'content-type: application/json' \
  -d '{"entity_fqn":"warehouse.crm.customers","score":87,"breakdown":{"contract":1.0,"pii":0.8,"dq":0.9}}'

# 6. Real-data scan — hard numbers, no screenshots
curl http://localhost:8000/api/metrics/scan

# 7. Token-efficiency snapshot (proof we don't full-scan the warehouse)
curl http://localhost:8000/api/metrics/efficiency

# 8. Mode banner — judges see this in the UI on boot
curl http://localhost:8000/api/system/info

# 9. MetaFlow as a virtual OM connector (export envelope)
curl http://localhost:8000/api/connector/export

# 10. Auth introspection — proves OAuth refresh is live (or PAT mode)
curl http://localhost:8000/api/system/auth

# 11. Publish all 12 MetaFlow specialists into OM as AI Studio personas
curl -X POST http://localhost:8000/api/personas/publish

# 12. Invoke a single persona (server-side or local fallback)
curl -X POST "http://localhost:8000/api/personas/metaflow.discovery_agent/invoke?message=find+pii+tables"
```

Open http://localhost:5173 → click **Contract Copilot** in the sidebar.

> 💡 **Judge Mode (one flag):** `JUDGE_MODE=true docker compose up` — points at `sandbox.open-metadata.org`, enables the Steward, runs against **real OpenMetadata** with no fixtures.

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
