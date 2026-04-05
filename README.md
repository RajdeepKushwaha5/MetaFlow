# MetaFlow 🌊

**Multi-MCP Agent Orchestration Platform for OpenMetadata**

MetaFlow orchestrates OpenMetadata's MCP server **alongside GitHub and Slack** through 7 specialized AI agents, enabling cross-platform metadata workflows via natural language chat and pre-built playbooks.

> Built for the [OpenMetadata Hackathon](https://github.com/open-metadata/OpenMetadata/issues/26645) — **Pick #2: Multi-MCP Agent Orchestrator** (Track T-01: MCP Ecosystem & AI Agents)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         React Frontend                              │
│   ┌──────────────┐   ┌────────────────────────────────────────────┐ │
│   │  Chat Panel   │   │           Playbook Runner                 │ │
│   │  (free-form)  │   │  🎯 Impact  🔒 PII  🚨 DQ  🩺 Health     │ │
│   │               │   │  📊 DQ Report & Notify  🛡️ PII & Track   │ │
│   └──────┬───────┘   └──────────────┬───────────────────────────┘ │
│          │          SSE Streaming    │                             │
└──────────┼──────────────────────────┼─────────────────────────────┘
           │                          │
┌──────────┼──────────────────────────┼─────────────────────────────┐
│          ▼       FastAPI Backend    ▼                             │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │          LangGraph Supervisor Orchestrator (7 agents)     │   │
│   │                                                           │   │
│   │  ┌───────────┐ ┌──────────┐ ┌──────────────────────┐     │   │
│   │  │ Discovery  │ │ Lineage  │ │     Curator          │     │   │
│   │  │  Agent     │ │  Agent   │ │     Agent            │     │   │
│   │  │ search 🔍  │ │ trace 🔗 │ │ patch📝 glossary📖  │     │   │
│   │  └───────────┘ └──────────┘ └──────────────────────┘     │   │
│   │  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│   │  │ DQ Agent  │ │Governance│ │ GitHub   │ │  Slack   │   │   │
│   │  │ RCA 🔬    │ │ tags 🏷️  │ │ Agent 🐙 │ │  Agent 💬│   │   │
│   │  │ tests ✅  │ │ comply ⚖️│ │ issues   │ │  alerts  │   │   │
│   │  └───────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│   └───────────┬────────────────────────┬───────────┬─────────┘   │
│               │                        │           │             │
└───────────────┼────────────────────────┼───────────┼─────────────┘
                │                        │           │
    ┌───────────▼──────────┐  ┌──────────▼──┐ ┌─────▼──────┐
    │   OpenMetadata MCP   │  │  GitHub API  │ │ Slack API  │
    │   (JSON-RPC 2.0)     │  │  (REST)      │ │ (Webhooks) │
    │   11 MCP Tools       │  │  Issues      │ │ Messages   │
    │   /mcp endpoint      │  │  Gists       │ │ Block Kit  │
    └──────────────────────┘  └─────────────┘ └────────────┘
```

## Why Multi-MCP?

The hackathon challenge asks: *"Combine OpenMetadata MCP with GitHub MCP, Slack MCP for cross-platform workflows."*

MetaFlow answers this by orchestrating **three platforms** through a single LangGraph supervisor:

1. **OpenMetadata MCP** — Metadata discovery, lineage, governance, DQ testing (11 tools)
2. **GitHub API** — Create issues, publish gist reports, search existing issues (3 tools)
3. **Slack Webhooks** — Team notifications with rich Block Kit formatting (2 tools)

**Cross-platform workflow example:**
> "Find failed DQ tests, create a GitHub issue, and notify Slack"
>
> → `data_quality_agent` scans via OM MCP → `github_agent` creates issue → `slack_agent` posts alert

## Features

### 🤖 7 Specialist Agents (Multi-MCP)

| Agent | Platform | Tools | Purpose |
|-------|----------|-------|---------|
| **Discovery** | OpenMetadata MCP | `semantic_search`, `search_metadata`, `get_entity_details` | Find and describe data assets |
| **Lineage** | OpenMetadata MCP | `get_entity_lineage`, `get_entity_details` | Trace data flow and dependencies |
| **Curator** | OpenMetadata MCP | `get_entity_details`, `patch_entity`, `create_glossary_term` | Enrich metadata, fix documentation |
| **Data Quality** | OpenMetadata MCP | `get_test_definitions`, `create_test_case`, `root_cause_analysis`, `get_entity_details` | DQ tests, failure diagnosis |
| **Governance** | OpenMetadata MCP | `search_metadata`, `semantic_search`, `get_entity_details`, `patch_entity`, `create_glossary`, `create_glossary_term` | Compliance, PII tagging, glossaries |
| **GitHub** | GitHub REST API | `create_github_issue`, `create_github_gist`, `search_github_issues` | Issue tracking, report publishing |
| **Slack** | Slack Webhooks | `send_slack_notification`, `send_slack_alert` | Team alerts with severity formatting |

### 📋 6 Playbooks (4 Core + 2 Cross-Platform)

**Core Playbooks (OpenMetadata only):**
- **🎯 Impact Radar** — Analyze blast radius of schema changes via lineage
- **🔒 PII Compliance Sweep** — Scan and tag PII across the catalog
- **🚨 Data Quality Fire Drill** — Root cause analysis + downstream impact
- **🩺 Metadata Health Doctor** — Audit and auto-fix metadata gaps

**Cross-Platform Playbooks (OM + GitHub + Slack):**
- **📊 DQ Report & Notify** — Find DQ failures → publish GitHub gist → alert Slack
- **🛡️ PII Compliance & Track** — Scan PII → tag tables → create GitHub issue → notify Slack

### 💬 Free-Form Chat
Natural language interface that automatically routes questions to the right specialist. Ask anything — the orchestrator decides which agents to invoke.

### 🌊 Real-Time Streaming
Server-Sent Events (SSE) for live agent reasoning and step-by-step playbook progress.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Orchestration** | LangGraph + langgraph-supervisor |
| **MCP Integration** | OpenMetadata AI SDK (`data-ai-sdk[langchain]`) |
| **LLM** | Google Gemini 2.5 Flash via LangChain |
| **Backend** | FastAPI + SSE-Starlette |
| **Frontend** | React 19 + TypeScript + Tailwind CSS |
| **Cross-Platform** | GitHub REST API + Slack Webhooks (via httpx) |
| **Deployment** | Docker Compose (OpenMetadata v1.12.4) |

## Quick Start

### Prerequisites
- Docker & Docker Compose (6GB+ RAM allocated)
- Google AI API key (free at https://aistudio.google.com/apikey)
- OpenMetadata PAT token (generated after first login)
- *(Optional)* GitHub personal access token for GitHub agent
- *(Optional)* Slack webhook URL for Slack agent

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
│   │   │   ├── prompts.py          # System prompts (7 agents + supervisor)
│   │   │   ├── specialists.py      # Specialist agent factory
│   │   │   └── orchestrator.py     # LangGraph multi-MCP supervisor
│   │   ├── tools/                  # Cross-platform tool modules
│   │   │   ├── github_tools.py     # GitHub REST API tools (3)
│   │   │   └── slack_tools.py      # Slack webhook tools (2)
│   │   └── playbooks/
│   │       ├── registry.py         # 6 playbook definitions
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
│       │   └── PlaybookRunner.tsx
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

## Cross-Platform Tools

| Tool | Platform | Parameters |
|------|----------|------------|
| `create_github_issue` | GitHub | title, body, labels |
| `create_github_gist` | GitHub | description, filename, content |
| `search_github_issues` | GitHub | query, state |
| `send_slack_notification` | Slack | message |
| `send_slack_alert` | Slack | title, summary, severity, details, link |

## Hackathon Alignment

### Pick #2: Multi-MCP Agent Orchestrator
> *"Combine OpenMetadata MCP with GitHub MCP, Slack MCP for cross-platform workflows"*

MetaFlow directly addresses this by:
- Orchestrating **3 platforms** (OpenMetadata MCP + GitHub + Slack) in a single supervisor
- **7 specialist agents** with domain-specific tool assignments
- **Cross-platform playbooks** that chain operations across all 3 platforms
- A **natural language router** that decides which agents to invoke

### Tracks Covered
- **T-01: MCP Ecosystem & AI Agents** (Primary) — Full multi-agent, multi-MCP orchestration
- **T-02: Data Quality & Observability** — DQ Fire Drill + DQ Report & Notify playbooks
- **T-05: Documentation & Developer Tools** — Metadata Health Doctor auto-docs
- **T-06: Open Innovation** — Cross-platform playbook-based metadata ops

## License

MIT
