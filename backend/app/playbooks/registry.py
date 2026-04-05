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
    icon="🎯",
    description=(
        "Analyze the blast radius of a schema change. Discovers the table, "
        "maps upstream and downstream lineage, identifies affected dashboards "
        "and pipelines, and generates an impact report."
    ),
    input_label="Change description",
    input_placeholder="e.g. Dropping column 'email' from customers table",
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
    icon="🔒",
    description=(
        "Scan the catalog for tables that may contain PII data. "
        "Check if they are properly tagged and classified, and "
        "apply missing governance tags."
    ),
    input_label="Search scope",
    input_placeholder="e.g. All tables in the 'shopify' database",
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
    icon="🚨",
    description=(
        "Investigate a data quality failure. Perform root cause analysis, "
        "trace the issue through lineage, and recommend remediation steps."
    ),
    input_label="Failure description",
    input_placeholder="e.g. Null rate spike on orders.amount column",
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
    icon="🩺",
    description=(
        "Audit metadata completeness across a schema. Find tables "
        "missing descriptions, owners, or tags and suggest fixes."
    ),
    input_label="Schema to audit",
    input_placeholder="e.g. The 'analytics' schema in BigQuery",
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
    icon="📊",
    description=(
        "Cross-platform workflow: Find data quality failures, create a "
        "GitHub gist with a detailed report, and post an alert to Slack."
    ),
    input_label="DQ scope",
    input_placeholder="e.g. Tables in the 'ecommerce' database with failed tests",
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
    icon="🛡️",
    description=(
        "Cross-platform workflow: Scan for PII tables, check compliance "
        "status, create a GitHub tracking issue, and notify via Slack."
    ),
    input_label="Compliance scope",
    input_placeholder="e.g. All tables in the 'marketing' domain",
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
    icon="📋",
    description=(
        "Cross-platform workflow: Find data quality failures, create a "
        "Google Sheet with the results, and alert the team on Slack."
    ),
    input_label="DQ scope",
    input_placeholder="e.g. Tables in the 'analytics' database with DQ failures",
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
    icon="📝",
    description=(
        "Cross-platform workflow: Audit metadata completeness, generate a "
        "Google Doc report, create a GitHub tracking issue, and notify Slack."
    ),
    input_label="Audit scope",
    input_placeholder="e.g. All tables in the 'warehouse' schema",
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

# Registry of all playbooks
PLAYBOOKS: dict[str, Playbook] = {
    p.id: p
    for p in [IMPACT_RADAR, PII_COMPLIANCE_SWEEP, DQ_FIRE_DRILL, METADATA_HEALTH,
              DQ_REPORT_NOTIFY, PII_TRACK_NOTIFY, DQ_SHEET_ALERT,
              METADATA_AUDIT_DOC]
}
