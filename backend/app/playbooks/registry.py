"""Playbook definitions — pre-built multi-step workflows.

Each playbook is a template that expands a short user input into a
structured multi-turn conversation executed against the orchestrator.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PlaybookStep:
    """A single step in a playbook."""

    instruction: str
    description: str


@dataclass(frozen=True)
class Playbook:
    """A reusable, multi-step workflow template."""

    id: str
    name: str
    icon: str
    description: str
    input_label: str
    input_placeholder: str
    steps: list[PlaybookStep] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Hero playbooks
# ---------------------------------------------------------------------------

IMPACT_RADAR = Playbook(
    id="impact-radar",
    name="Impact Radar",
    icon="target",
    description=(
        "Analyze the blast radius of a schema change. Discovers the table, "
        "maps upstream and downstream lineage, identifies affected dashboards "
        "and pipelines, and generates an impact report."
    ),
    input_label="Change description",
    input_placeholder="Dropping column email from sample_db_service.ecommerce_db.shopify.dim_customer",
    steps=[
        PlaybookStep(
            instruction=(
                "Find the table mentioned in the following change description "
                "and return its full details: {user_input}"
            ),
            description="Discovering affected entity",
        ),
        PlaybookStep(
            instruction=(
                "Now trace the full lineage of the entity found above — "
                "both upstream sources and downstream consumers. "
                "Identify all dashboards, pipelines, and tables that would "
                "be impacted by this change: {user_input}"
            ),
            description="Mapping lineage blast radius",
        ),
        PlaybookStep(
            instruction=(
                "Based on the lineage analysis, generate a structured impact "
                "report. For each affected downstream entity, state:\n"
                "- Entity name and type\n"
                "- Owner\n"
                "- Severity (Critical / High / Medium / Low)\n"
                "- Recommended action\n\n"
                "Original change: {user_input}"
            ),
            description="Generating impact report",
        ),
    ],
)

PII_COMPLIANCE_SWEEP = Playbook(
    id="pii-sweep",
    name="PII Compliance Sweep",
    icon="lock",
    description=(
        "Scan the catalog for tables that may contain PII data. "
        "Check if they are properly tagged and classified, and "
        "apply missing governance tags."
    ),
    input_label="Search scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify",
    steps=[
        PlaybookStep(
            instruction=(
                "Search for tables that may contain personally identifiable "
                "information (PII) such as email, phone, SSN, address, "
                "name, date of birth. Scope: {user_input}"
            ),
            description="Scanning for PII candidates",
        ),
        PlaybookStep(
            instruction=(
                "For each table found that may contain PII, check if it "
                "already has PII-related tags (like 'PII', 'Sensitive', "
                "'PersonalData'). List each table and its current tags."
            ),
            description="Auditing current PII tags",
        ),
        PlaybookStep(
            instruction=(
                "For any tables that contain likely PII columns but are "
                "missing PII tags, apply the appropriate tags. Report "
                "what was tagged and what was already compliant."
            ),
            description="Applying missing PII tags",
        ),
    ],
)

DQ_FIRE_DRILL = Playbook(
    id="dq-fire-drill",
    name="Data Quality Fire Drill",
    icon="alert-triangle",
    description=(
        "Investigate a data quality failure. Perform root cause analysis, "
        "trace the issue through lineage, and recommend remediation steps."
    ),
    input_label="Failure description",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email",
    steps=[
        PlaybookStep(
            instruction=(
                "Perform a root cause analysis on this data quality issue: "
                "{user_input}"
            ),
            description="Running AI root cause analysis",
        ),
        PlaybookStep(
            instruction=(
                "Based on the root cause analysis above, trace the lineage "
                "of the affected entity to determine downstream impact. "
                "How many consumers are affected?"
            ),
            description="Assessing downstream impact",
        ),
        PlaybookStep(
            instruction=(
                "Generate a remediation report including:\n"
                "- Root cause summary\n"
                "- Affected entities and severity\n"
                "- Recommended fix steps\n"
                "- Suggested new test cases to prevent recurrence"
            ),
            description="Building remediation plan",
        ),
    ],
)

METADATA_HEALTH = Playbook(
    id="metadata-health",
    name="Metadata Health Doctor",
    icon="stethoscope",
    description=(
        "Audit metadata completeness across a schema. Find tables "
        "missing descriptions, owners, or tags and suggest fixes."
    ),
    input_label="Schema to audit",
    input_placeholder="sample_db_service.ecommerce_db.shopify",
    steps=[
        PlaybookStep(
            instruction=(
                "Search for all tables in the following scope and identify "
                "which ones are missing descriptions, owners, or tags: "
                "{user_input}"
            ),
            description="Scanning for metadata gaps",
        ),
        PlaybookStep(
            instruction=(
                "For the tables with missing metadata found above, generate "
                "suggested descriptions based on their column names and "
                "any existing context. Present as a table with columns: "
                "Entity | Missing Fields | Suggested Description"
            ),
            description="Generating metadata suggestions",
        ),
        PlaybookStep(
            instruction=(
                "Apply the suggested descriptions to the tables that are "
                "missing them. Report what was updated."
            ),
            description="Applying metadata fixes",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Cross-platform playbooks — Multi-MCP workflows (OM + GitHub + Slack)
# ---------------------------------------------------------------------------

DQ_REPORT_NOTIFY = Playbook(
    id="dq-report-notify",
    name="DQ Report & Notify",
    icon="file-bar-chart",
    description=(
        "Cross-platform workflow: Find data quality failures, create a "
        "GitHub gist with a detailed report, and post an alert to Slack."
    ),
    input_label="DQ scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email",
    steps=[
        PlaybookStep(
            instruction=(
                "Find all tables that have data quality test failures or "
                "issues in the following scope. For each, show the test name, "
                "status, and failure details: {user_input}"
            ),
            description="Scanning for DQ failures (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Based on the data quality failures found above, create a "
                "GitHub gist containing a markdown report. The report should "
                "include: a summary table of all failures, severity levels, "
                "affected entities with links, and recommended next steps. "
                "Name the file 'dq-report.md'."
            ),
            description="Publishing DQ report to GitHub (GitHub API)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack alert about the data quality failures found. "
                "Set severity based on the number and criticality of failures. "
                "Include a brief summary of findings and a link to the "
                "GitHub gist report created in the previous step."
            ),
            description="Alerting team via Slack (Slack Webhook)",
        ),
    ],
)

PII_TRACK_NOTIFY = Playbook(
    id="pii-track-notify",
    name="PII Compliance & Track",
    icon="shield-check",
    description=(
        "Cross-platform workflow: Scan for PII tables, check compliance "
        "status, create a GitHub tracking issue, and notify via Slack."
    ),
    input_label="Compliance scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify",
    steps=[
        PlaybookStep(
            instruction=(
                "Search for all tables that may contain PII (personally "
                "identifiable information) in the following scope. Check "
                "which tables have proper PII tags and which are missing "
                "governance classification: {user_input}"
            ),
            description="Scanning for PII tables (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "For PII tables that are missing proper tags or classification, "
                "apply the appropriate PII and Sensitive tags. Report what "
                "was tagged and what was already compliant."
            ),
            description="Applying governance tags (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Create a GitHub issue to track the PII compliance review. "
                "Title should mention the scope and date. Body should include: "
                "tables found with PII, which were already compliant, which "
                "were newly tagged, and any remaining action items. "
                "Add labels: 'pii', 'compliance', 'governance'."
            ),
            description="Creating tracking issue (GitHub API)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack notification summarizing the PII compliance "
                "review. Include the number of tables scanned, compliance "
                "rate, and a link to the GitHub issue. Use 'info' severity "
                "if all tables are compliant, 'warning' if some are not."
            ),
            description="Notifying team via Slack (Slack Webhook)",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Google Workspace playbooks — Multi-MCP workflows (OM + Google + Slack/GitHub)
# ---------------------------------------------------------------------------

DQ_SHEET_ALERT = Playbook(
    id="dq-sheet-alert",
    name="DQ Sheet & Alert",
    icon="sheet",
    description=(
        "Cross-platform workflow: Find data quality failures, create a "
        "Google Sheet with the results, and alert the team on Slack."
    ),
    input_label="DQ scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email",
    steps=[
        PlaybookStep(
            instruction=(
                "Find all tables that have data quality test failures in the "
                "following scope. For each, list the table name, test name, "
                "status, severity, and failure details: {user_input}"
            ),
            description="Scanning for DQ failures (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Based on the data quality failures found above, create a "
                "Google Sheet containing the results. Use the title "
                "'DQ Failures Report' with headers: "
                "Table, Test, Status, Severity, Details, Owner. "
                "Populate rows from the failures found."
            ),
            description="Creating DQ report spreadsheet (Google Sheets)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack alert about the data quality failures. "
                "Set severity based on the findings. Include a summary "
                "and the link to the Google Sheet created in the previous step."
            ),
            description="Alerting team via Slack (Slack Webhook)",
        ),
    ],
)

METADATA_AUDIT_DOC = Playbook(
    id="metadata-audit-doc",
    name="Metadata Audit Doc",
    icon="file-text",
    description=(
        "Cross-platform workflow: Audit metadata completeness, generate a "
        "Google Doc report, create a GitHub tracking issue, and notify Slack."
    ),
    input_label="Audit scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify",
    steps=[
        PlaybookStep(
            instruction=(
                "Audit metadata completeness for the following scope. "
                "Identify tables missing descriptions, owners, or tags. "
                "Count total tables vs compliant tables: {user_input}"
            ),
            description="Auditing metadata completeness (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Based on the metadata audit above, create a Google Doc "
                "containing a detailed audit report. Include:\n"
                "# Metadata Audit Report\n"
                "## Summary\n"
                "Total tables, compliance rate, key findings.\n"
                "## Tables Missing Metadata\n"
                "List each table and what's missing.\n"
                "## Recommendations\n"
                "Action items to improve metadata coverage."
            ),
            description="Publishing audit report (Google Docs)",
        ),
        PlaybookStep(
            instruction=(
                "Create a GitHub issue to track the metadata audit findings. "
                "Title: 'Metadata Audit — [scope] — Action Required'. "
                "Include the audit summary, link to the Google Doc, and "
                "a checklist of action items. Labels: 'metadata', 'audit'."
            ),
            description="Creating tracking issue (GitHub API)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack notification summarizing the metadata audit. "
                "Include the compliance rate, key findings, and links to "
                "both the Google Doc report and the GitHub tracking issue."
            ),
            description="Notifying team via Slack (Slack Webhook)",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Jira + Email + Notion playbooks — 7-platform cross-platform workflows
# ---------------------------------------------------------------------------

DQ_JIRA_EMAIL = Playbook(
    id="dq-jira-email",
    name="DQ Ticket & Email",
    icon="ticket-check",
    description=(
        "Cross-platform workflow: Find data quality failures, create a "
        "Jira ticket to track remediation, and email the data owner."
    ),
    input_label="DQ scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email",
    steps=[
        PlaybookStep(
            instruction=(
                "Find all data quality test failures related to: {user_input}. "
                "For each failure, show the test name, status, severity, and details."
            ),
            description="Scanning for DQ failures (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Based on the DQ failures found above, create a Jira issue. "
                "Title: 'DQ Failure — [entity name]'. Description should include: "
                "Summary of all failures, severity levels, affected entities, "
                "and recommended remediation steps. Set priority based on severity. "
                "Add labels: 'data-quality', 'automated'."
            ),
            description="Creating Jira ticket (Jira API)",
        ),
        PlaybookStep(
            instruction=(
                "Send an email alert about the DQ failures to the data owner. "
                "Set severity based on the findings. Include a brief summary "
                "and mention the Jira ticket created in the previous step."
            ),
            description="Emailing data owner (SMTP)",
        ),
    ],
)

LINEAGE_NOTION_JIRA = Playbook(
    id="lineage-notion-jira",
    name="Lineage Doc & Track",
    icon="git-branch",
    description=(
        "Cross-platform workflow: Trace entity lineage, document it as a "
        "Notion page, and create a Jira ticket for follow-up actions."
    ),
    input_label="Entity to trace",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer",
    steps=[
        PlaybookStep(
            instruction=(
                "Find the entity described below and trace its full lineage — "
                "both upstream sources and downstream consumers: {user_input}"
            ),
            description="Tracing data lineage (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Based on the lineage analysis above, create a Notion page "
                "documenting the data lineage. Title: 'Lineage Documentation — "
                "[entity name]'. Include sections: Upstream Sources, Downstream "
                "Consumers, Data Flow, Impact Assessment, and Recommendations."
            ),
            description="Creating lineage doc (Notion API)",
        ),
        PlaybookStep(
            instruction=(
                "Create a Jira issue to track any lineage-related action items. "
                "Title: 'Lineage Review — [entity name]'. Include a link to the "
                "Notion documentation page and list any concerns found (missing "
                "lineage, undocumented dependencies, PII propagation). "
                "Labels: 'lineage', 'documentation'."
            ),
            description="Creating tracking ticket (Jira API)",
        ),
    ],
)

FULL_INCIDENT_RESPONSE = Playbook(
    id="full-incident-response",
    name="Full Incident Response",
    icon="workflow",
    description=(
        "7-platform mega workflow: Diagnose a DQ incident, create a Google "
        "Sheet report, document in Notion, file a Jira ticket, create a "
        "GitHub issue, email the owner, and alert Slack."
    ),
    input_label="Incident description",
    input_placeholder="Null rate on sample_db_service.ecommerce_db.shopify.dim_customer.customer_id exceeded threshold",
    steps=[
        PlaybookStep(
            instruction=(
                "Perform a thorough investigation of this data incident: "
                "{user_input}. Run root cause analysis, trace affected lineage, "
                "and assess the full blast radius. Produce a structured cause "
                "tree and impact scores for all affected entities."
            ),
            description="Investigating incident (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Create a Google Sheet summarizing the incident. Title: "
                "'Incident Report — [date]'. Headers: Entity, Issue, Severity, "
                "Impact Score, Status. Populate with all findings from the investigation."
            ),
            description="Creating incident spreadsheet (Google Sheets)",
        ),
        PlaybookStep(
            instruction=(
                "Create a detailed Notion page documenting the incident. Include: "
                "# Incident Report, ## Timeline, ## Root Cause (with cause tree), "
                "## Impact Assessment (with impact scores), ## Affected Entities, "
                "## Remediation Plan, ## Lessons Learned."
            ),
            description="Documenting in Notion (Notion API)",
        ),
        PlaybookStep(
            instruction=(
                "Create a Jira issue to track remediation. Priority: High. "
                "Include links to the Google Sheet and Notion documentation. "
                "Labels: 'incident', 'data-quality', 'urgent'."
            ),
            description="Filing Jira ticket (Jira API)",
        ),
        PlaybookStep(
            instruction=(
                "Create a GitHub issue for engineering follow-up. Include "
                "technical details, root cause, and a checklist of fixes. "
                "Labels: 'incident', 'data-quality', 'P1'."
            ),
            description="Creating GitHub issue (GitHub API)",
        ),
        PlaybookStep(
            instruction=(
                "Send an email report to the data owner with full incident "
                "details, links to all created artifacts, and next steps. "
                "Severity: critical."
            ),
            description="Emailing data owner (SMTP)",
        ),
        PlaybookStep(
            instruction=(
                "Send a critical Slack alert summarizing the incident. Include "
                "links to the Jira ticket, GitHub issue, Google Sheet, and "
                "Notion page. Keep it concise but actionable."
            ),
            description="Alerting team on Slack (Slack Webhook)",
        ),
    ],
)

# ---------------------------------------------------------------------------
# AI-Powered playbooks — DQ recommendations & Platform Health KPIs
# ---------------------------------------------------------------------------

DQ_TEST_RECOMMENDER = Playbook(
    id="dq-test-recommender",
    name="DQ Test Recommender",
    icon="sparkles",
    description=(
        "AI-powered workflow: Analyze a table's columns and profile, "
        "then suggest and create appropriate data quality tests with "
        "sensible default parameters. The AI explains its reasoning."
    ),
    input_label="Table to analyze",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer",
    steps=[
        PlaybookStep(
            instruction=(
                "Get the full details of this table including all columns, "
                "their types, descriptions, and any existing tags or tests: "
                "{user_input}"
            ),
            description="Inspecting table profile (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "List all available data quality test definitions. Then "
                "analyze the columns of the table above and recommend "
                "appropriate tests for each column. Consider:\n"
                "- Column name patterns (email → format, id → uniqueness)\n"
                "- Data types (numeric → range checks, string → regex)\n"
                "- Descriptions (hints about expected values)\n"
                "- Existing tests (avoid duplicates)\n\n"
                "Present recommendations as a table:\n"
                "| Column | Suggested Test | Parameters | Reasoning |\n"
                "Include at least 3-5 test recommendations."
            ),
            description="AI-analyzing columns & recommending tests",
        ),
        PlaybookStep(
            instruction=(
                "Create the top 3 most impactful recommended test cases "
                "from the analysis above. Use the appropriate test definition "
                "and sensible default parameters. Report each created test "
                "with its entity link and configuration."
            ),
            description="Creating recommended test cases (OpenMetadata MCP)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack notification summarizing the DQ test setup:\n"
                "- Which table was analyzed\n"
                "- How many tests were recommended vs created\n"
                "- What types of tests were added\n"
                "Use 'success' severity."
            ),
            description="Notifying team (Slack Webhook)",
        ),
    ],
)

PLATFORM_HEALTH_KPI = Playbook(
    id="platform-health-kpi",
    name="Platform Health & KPI Report",
    icon="bar-chart-3",
    description=(
        "Analytics workflow: Query platform-wide KPIs — documentation "
        "coverage, ownership rates, DQ pass rates — and generate a "
        "comprehensive Google Sheet dashboard with Slack summary."
    ),
    input_label="Report scope",
    input_placeholder="sample_db_service.ecommerce_db.shopify",
    steps=[
        PlaybookStep(
            instruction=(
                "Get a comprehensive data insights summary for the platform. "
                "Include total entity counts, documentation coverage percentage, "
                "ownership coverage percentage. Scope: {user_input}"
            ),
            description="Querying platform analytics (OM REST API)",
        ),
        PlaybookStep(
            instruction=(
                "Get the data quality summary: total tests, pass/fail counts, "
                "pass rate, and the top failing tests. Also get ownership and "
                "description coverage details."
            ),
            description="Gathering DQ & coverage KPIs (OM REST API)",
        ),
        PlaybookStep(
            instruction=(
                "Create a Google Sheet KPI dashboard. Title: "
                "'Platform Health KPI Report'. Include sheets with:\n"
                "Headers: Metric, Value, Target, Status\n"
                "Rows for: Total Tables, Doc Coverage %, Ownership %, "
                "DQ Pass Rate %, Total Tests, Failed Tests\n"
                "Then a second table of top failing tests with details."
            ),
            description="Building KPI spreadsheet (Google Sheets)",
        ),
        PlaybookStep(
            instruction=(
                "Send a Slack alert with the KPI summary. Include the key "
                "metrics (doc coverage, ownership, DQ pass rate) and a link "
                "to the Google Sheet. Use severity based on the numbers: "
                "'success' if all >80%, 'warning' if any <80%, 'critical' "
                "if any <50%."
            ),
            description="Broadcasting KPI summary (Slack Webhook)",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Hero P0 — Contract Copilot (Generate → Publish → Materialize → Heal)
# ---------------------------------------------------------------------------

CONTRACT_COPILOT = Playbook(
    id="contract-copilot",
    name="Contract Copilot",
    icon="shield",
    description=(
        "Hero workflow: turn a table into a self-healing OpenMetadata "
        "Data Contract. Generates schema + semantics + SLA + quality "
        "gates from lineage and profiler stats, publishes to OM, "
        "materializes the gates as test cases, and drafts a remediation "
        "PR if the contract is ever violated."
    ),
    input_label="Target table FQN",
    input_placeholder="sample_db_service.ecommerce_db.shopify.dim_customer",
    steps=[
        PlaybookStep(
            instruction=(
                "Generate a complete Data Contract for this table. Walk its "
                "upstream lineage, analyze profiler stats for every column, "
                "and synthesize schema expectations, semantics rules, an SLA "
                "(freshness + volume + availability), and quality gates with "
                "blocker/major/minor severities: {user_input}"
            ),
            description="Generating contract from lineage + profile",
        ),
        PlaybookStep(
            instruction=(
                "Publish the contract you just generated back to OpenMetadata "
                "via the dataContracts API (status: Draft). Confirm the "
                "contract URL and the assigned status."
            ),
            description="Publishing to OpenMetadata Data Contracts API",
        ),
        PlaybookStep(
            instruction=(
                "Materialize each quality gate from the contract as a real "
                "OpenMetadata test case. Report how many test cases were "
                "created, skipped, or failed. The contract is now enforceable."
            ),
            description="Materializing quality gates as OM test cases",
        ),
        PlaybookStep(
            instruction=(
                "Get the current status of the contract. If it is `Violated`, "
                "call propose_contract_heal with a one-line summary of the "
                "violation and hand the resulting ticket_draft to the GitHub "
                "agent to open a remediation PR. If it is `Active` or "
                "`Draft`, simply confirm the contract is healthy and report "
                "the next evaluation window."
            ),
            description="Monitoring + healing if violated",
        ),
    ],
)

BULK_LINEAGE_FROM_QUERY_LOGS = Playbook(
    id="bulk-lineage-from-query-logs",
    name="Bulk Lineage from Query Logs",
    icon="git-branch",
    description=(
        "Scale-out lineage authoring inspired by the OpenMetadata AI agent "
        "workflow. Reads recorded query history, infers source -> target pairs "
        "from JOIN / INSERT INTO patterns, then writes lineage edges into "
        "OpenMetadata in one batch."
    ),
    input_label="Service or scope",
    input_placeholder="sample_db_service",
    steps=[
        PlaybookStep(
            instruction=(
                "Call get_query_history_lineage_candidates with service_name "
                "set to the user input below (treat blank as all services). "
                "Show the user the top 10 candidates as a table with "
                "source, target, confidence, and evidence count.\n\n"
                "User scope: {user_input}"
            ),
            description="Inferring lineage from query history",
        ),
        PlaybookStep(
            instruction=(
                "Now call bulk_add_lineage_edges with the candidates JSON "
                "from the previous step and min_confidence=0.7. Report how "
                "many edges were added, skipped (low confidence), and "
                "failed. Reference the OM URL for one of the newly-linked "
                "tables so the user can verify."
            ),
            description="Materializing edges in OpenMetadata",
        ),
    ],
)

# Registry of all playbooks
PLAYBOOKS: dict[str, Playbook] = {
    p.id: p
    for p in [CONTRACT_COPILOT, IMPACT_RADAR, PII_COMPLIANCE_SWEEP, DQ_FIRE_DRILL, METADATA_HEALTH,
              DQ_REPORT_NOTIFY, PII_TRACK_NOTIFY, DQ_SHEET_ALERT,
              METADATA_AUDIT_DOC, DQ_JIRA_EMAIL, LINEAGE_NOTION_JIRA,
              FULL_INCIDENT_RESPONSE, DQ_TEST_RECOMMENDER, PLATFORM_HEALTH_KPI,
              BULK_LINEAGE_FROM_QUERY_LOGS]
}
