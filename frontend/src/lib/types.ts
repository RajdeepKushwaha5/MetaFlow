/** Shared TypeScript types. */

export interface PlaybookInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  input_label: string;
  input_placeholder: string;
  step_count: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  agentSteps?: AgentStep[];
}

export interface AgentStep {
  agent: string;
  tools: string[];
  status: "running" | "done";
}

export interface PlaybookStepEvent {
  type: "step_start" | "chunk" | "step_done" | "playbook_done" | "error";
  step?: number;
  description?: string;
  content?: string;
  message?: string;
}

// Conversation History
export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
}

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  messages: ConversationMessage[];
}

// Agent Dashboard
export interface AgentStat {
  agent: string;
  calls: number;
  avg_duration_ms: number;
}

export interface PlatformStat {
  platform: string;
  tool_calls: number;
}

export interface DashboardStats {
  total_conversations: number;
  total_messages: number;
  agents: AgentStat[];
  platforms: PlatformStat[];
  recent_activity: Record<string, unknown>[];
}

// LLM Settings
export interface LLMSettings {
  provider: string;
  model: string;
  gemini_key_set: boolean;
  openai_key_set: boolean;
  gemini_models: string[];
  openai_models: string[];
}

export interface LLMSettingsUpdate {
  provider?: string;
  model?: string;
  gemini_key?: string;
  openai_key?: string;
}

// Integrations
export interface IntegrationStatus {
  id: string;
  name: string;
  configured: boolean;
  fields: Record<string, string>;
}

export interface IntegrationsResponse {
  integrations: IntegrationStatus[];
}

export interface IntegrationsUpdate {
  om_host?: string;
  om_token?: string;
  github_token?: string;
  github_default_repo?: string;
  slack_webhook_url?: string;
  jira_url?: string;
  jira_user?: string;
  jira_api_token?: string;
  jira_project_key?: string;
  notion_api_key?: string;
  notion_database_id?: string;
  google_service_account_file?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  webhook_secret?: string;
}

// ---------------------------------------------------------------------------
// Data Reliability
// ---------------------------------------------------------------------------

export interface ImpactNode {
  fqn: string;
  type: string;
  service: string;
  layer: number;
  failing?: boolean;
  consumers?: number;
}

export interface ImpactEdge {
  source: string;
  target: string;
}

export interface ImpactGraph {
  entity_fqn: string;
  score: number;
  severity: "critical" | "high" | "medium" | "low";
  demo: boolean;
  breakdown: {
    downstream_tables: number;
    downstream_dashboards: number;
    downstream_pipelines: number;
    total_consumers: number;
    criticality_tier: number;
    hours_since_last_failure: number;
  };
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  explanation: string;
}

export interface CauseTreeNode {
  id: string;
  label: string;
  kind: string;
  severity?: string;
  evidence?: string;
  is_root_cause?: boolean;
  children: CauseTreeNode[];
}

export interface CauseTree {
  test_fqn: string;
  test_name: string;
  status: string;
  demo: boolean;
  narrative: string;
  tree: CauseTreeNode;
  suggested_actions: { label: string; kind: string; confidence: number }[];
}

export interface DqRecommendation {
  id: string;
  test_type: string;
  column: string | null;
  rationale: string;
  confidence: number;
  params: Record<string, unknown>;
}

export interface DqRecommendationList {
  table_fqn: string;
  demo: boolean;
  recommendations: DqRecommendation[];
}

export interface CreateTestResult {
  created: boolean;
  demo?: boolean;
  message?: string;
  preview?: Record<string, unknown>;
  test_case?: Record<string, unknown>;
}

// Auto-Remediation
export interface DriftSignal {
  metric: string;
  baseline?: number | null;
  current?: number | null;
  delta?: number;
  delta_pct?: number;
  severity: "critical" | "high" | "medium" | "low";
}

export interface RemediationCandidate {
  table_fqn: string;
  column: string;
  drift_score: number;
  owner: { name: string; email: string; type: string; fqn?: string };
  signals: DriftSignal[];
  profile_url: string;
}

export interface SuggestedTicket {
  title?: string;
  summary?: string;
  body?: string;
  description?: string;
  assignees?: string[];
  assignee?: string;
  labels?: string[];
  project?: string;
  issue_type?: string;
  priority?: string;
}

export interface AutoRemediation {
  test_fqn: string;
  target_table: string;
  target_column: string;
  demo: boolean;
  confidence: number;
  root_cause: RemediationCandidate;
  candidates: RemediationCandidate[];
  owner: RemediationCandidate["owner"];
  narrative: string;
  suggested_tickets: { github: SuggestedTicket; jira: SuggestedTicket };
  timeline: { at: string; event: string }[];
}

export interface DispatchTicketResult {
  created: boolean;
  demo?: boolean;
  target?: string;
  result?: { url?: string; number?: number; key?: string; id?: string };
  error?: string;
  message?: string;
  payload?: SuggestedTicket;
}

// Data Contract
export interface ContractSchemaField {
  name: string;
  type: string;
  required: boolean;
  max_null_ratio: number;
  unique?: boolean;
  range?: { min: number; max: number };
  regex?: string;
}

export interface ContractQualityGate {
  name: string;
  applies_to: string;
  test: string;
  params?: Record<string, unknown>;
  severity: "blocker" | "major" | "minor";
}

export interface ContractSLA {
  freshness: { max_lag_hours: number; check: string };
  volume: { min_rows: number; max_rows: number; window: string };
  availability: string;
}

export interface DataContract {
  contract_version: string;
  generated_by: string;
  entity: { fqn: string; type: string; owner: string; domain: string; tier?: string };
  schema: ContractSchemaField[];
  sla: ContractSLA;
  quality_gates: ContractQualityGate[];
  lineage_sources: { fqn: string; owner: string; contributes: string[] }[];
}

export interface ContractResponse {
  entity_fqn: string;
  demo: boolean;
  contract: DataContract;
  yaml: string;
  narrative: string;
  stats: {
    upstream_sources: number;
    columns_analyzed: number;
    quality_gates: number;
    schema_expectations: number;
  };
}

export interface PublishContractResult {
  published: boolean;
  demo?: boolean;
  method?: string;
  message?: string;
  preview_url?: string;
  result?: Record<string, unknown>;
}

export interface ContractStatusResponse {
  entity_fqn: string;
  found: boolean;
  status: string;
  contract_id?: string;
  contract_name?: string;
  contract_url?: string;
  last_evaluated?: string | null;
  next_evaluation?: string | null;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface CreateTestCasesResult {
  entity_fqn: string;
  created: { name: string; column?: string; id?: string }[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
  summary: string;
  demo?: boolean;
}

export interface ContractHealResponse {
  entity_fqn: string;
  violation: string;
  classification: string;
  diff: string;
  patch_paths: string[];
  ticket_draft: {
    title: string;
    body: string;
    labels: string[];
  };
}
