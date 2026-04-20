/** API client for the MetaFlow backend. */

import type {
  PlaybookInfo,
  ConversationSummary,
  ConversationDetail,
  DashboardStats,
  LLMSettings,
  LLMSettingsUpdate,
  IntegrationsResponse,
  IntegrationsUpdate,
  ImpactGraph,
  CauseTree,
  DqRecommendationList,
  DqRecommendation,
  CreateTestResult,
  AutoRemediation,
  DispatchTicketResult,
  ContractResponse,
  DataContract,
  PublishContractResult,
  ContractStatusResponse,
  CreateTestCasesResult,
  ContractHealResponse,
} from "./types";

const BASE = "";

/**
 * Consume an SSE-style response body, parsing `data:` lines as JSON and
 * invoking `onEvent` for each one. Flushes any trailing buffered data when
 * the stream ends and honours `AbortSignal` cancellation.
 */
async function readSSEStream(
  res: Response,
  onEvent?: (data: Record<string, unknown>) => void,
  signal?: AbortSignal
) {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  const flushLines = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        onEvent?.(JSON.parse(json));
      } catch {
        // skip malformed events
      }
    }
  };

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    flushLines(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail || buffer) flushLines(tail);
}

export async function fetchPlaybooks(): Promise<PlaybookInfo[]> {
  const res = await fetch(`${BASE}/api/playbooks`);
  if (!res.ok) throw new Error("Failed to fetch playbooks");
  return res.json();
}

/**
 * Stream a chat message. Returns an EventSource-like reader that
 * yields parsed JSON events.
 */
export async function streamChat(
  message: string,
  threadId?: string | null,
  onEvent?: (data: Record<string, unknown>) => void,
  signal?: AbortSignal
) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId }),
    signal,
  });

  if (!res.ok) throw new Error("Chat request failed");
  await readSSEStream(res, onEvent, signal);
}

/**
 * Stream a playbook execution. Works the same as streamChat but
 * for the playbook endpoint.
 */
export async function streamPlaybook(
  playbookId: string,
  userInput: string,
  onEvent?: (data: Record<string, unknown>) => void,
  signal?: AbortSignal
) {
  const res = await fetch(`${BASE}/api/playbooks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playbook_id: playbookId, user_input: userInput }),
    signal,
  });

  if (!res.ok) throw new Error("Playbook request failed");
  await readSSEStream(res, onEvent, signal);
}

// ---------------------------------------------------------------------------
// Conversation History
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${BASE}/api/conversations`);
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${BASE}/api/conversations/${id}`);
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete conversation");
}

// ---------------------------------------------------------------------------
// Agent Dashboard
// ---------------------------------------------------------------------------

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

// ---------------------------------------------------------------------------
// LLM Settings
// ---------------------------------------------------------------------------

async function parseError(res: Response, fallback: string): Promise<never> {
  try {
    const body = await res.json();
    throw new Error(body?.detail || body?.message || fallback);
  } catch (e) {
    if (e instanceof Error && e.message !== fallback) throw e;
    throw new Error(fallback);
  }
}

export async function fetchSettings(): Promise<LLMSettings> {
  const res = await fetch(`${BASE}/api/settings`);
  if (!res.ok) await parseError(res, "Failed to fetch settings");
  return res.json();
}

export async function updateSettings(data: LLMSettingsUpdate): Promise<LLMSettings> {
  const res = await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseError(res, "Failed to update settings");
  return res.json();
}

export async function fetchIntegrations(): Promise<IntegrationsResponse> {
  const res = await fetch(`${BASE}/api/integrations`);
  if (!res.ok) await parseError(res, "Failed to fetch integrations");
  return res.json();
}

export async function updateIntegrations(data: IntegrationsUpdate): Promise<IntegrationsResponse> {
  const res = await fetch(`${BASE}/api/integrations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseError(res, "Failed to update integrations");
  return res.json();
}

// ---------------------------------------------------------------------------
// Data Reliability
// ---------------------------------------------------------------------------

export async function fetchImpact(entityFqn: string, maxDepth = 3): Promise<ImpactGraph> {
  const res = await fetch(
    `${BASE}/api/reliability/impact?entity_fqn=${encodeURIComponent(entityFqn)}&max_depth=${maxDepth}`
  );
  if (!res.ok) await parseError(res, "Failed to fetch impact");
  return res.json();
}

export async function fetchCauseTree(testFqn: string): Promise<CauseTree> {
  const res = await fetch(
    `${BASE}/api/reliability/cause-tree?test_fqn=${encodeURIComponent(testFqn)}`
  );
  if (!res.ok) await parseError(res, "Failed to fetch cause tree");
  return res.json();
}

export async function fetchRecommendations(tableFqn: string): Promise<DqRecommendationList> {
  const res = await fetch(
    `${BASE}/api/reliability/recommendations?table_fqn=${encodeURIComponent(tableFqn)}`
  );
  if (!res.ok) await parseError(res, "Failed to fetch recommendations");
  return res.json();
}

export async function createTestCase(
  tableFqn: string,
  recommendation: DqRecommendation
): Promise<CreateTestResult> {
  const res = await fetch(`${BASE}/api/reliability/create-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table_fqn: tableFqn, recommendation }),
  });
  if (!res.ok) await parseError(res, "Failed to create test");
  return res.json();
}

export async function fetchAutoRemediation(testFqn: string): Promise<AutoRemediation> {
  const res = await fetch(
    `${BASE}/api/reliability/auto-remediate?test_fqn=${encodeURIComponent(testFqn)}`
  );
  if (!res.ok) await parseError(res, "Failed to run auto-remediation");
  return res.json();
}

export async function dispatchTicket(
  remediation: AutoRemediation,
  target: "github" | "jira"
): Promise<DispatchTicketResult> {
  const res = await fetch(`${BASE}/api/reliability/dispatch-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remediation, target }),
  });
  if (!res.ok) await parseError(res, "Failed to dispatch ticket");
  return res.json();
}

export async function fetchContract(entityFqn: string, maxDepth = 3): Promise<ContractResponse> {
  const res = await fetch(
    `${BASE}/api/reliability/contract?entity_fqn=${encodeURIComponent(entityFqn)}&max_depth=${maxDepth}`
  );
  if (!res.ok) await parseError(res, "Failed to generate contract");
  return res.json();
}

export async function publishContract(
  entityFqn: string,
  contract: DataContract
): Promise<PublishContractResult> {
  const res = await fetch(`${BASE}/api/reliability/contract/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_fqn: entityFqn, contract }),
  });
  if (!res.ok) await parseError(res, "Failed to publish contract");
  return res.json();
}

export async function fetchContractStatus(entityFqn: string): Promise<ContractStatusResponse> {
  const res = await fetch(
    `${BASE}/api/reliability/contract/status?entity_fqn=${encodeURIComponent(entityFqn)}`
  );
  if (!res.ok) await parseError(res, "Failed to fetch contract status");
  return res.json();
}

export async function createContractTestCases(
  entityFqn: string,
  contract: DataContract
): Promise<CreateTestCasesResult> {
  const res = await fetch(`${BASE}/api/reliability/contract/create-tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_fqn: entityFqn, contract }),
  });
  if (!res.ok) await parseError(res, "Failed to create test cases");
  return res.json();
}

export async function proposeContractHeal(
  entityFqn: string,
  violationSummary: string
): Promise<ContractHealResponse> {
  const res = await fetch(`${BASE}/api/reliability/contract/heal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_fqn: entityFqn, violation_summary: violationSummary }),
  });
  if (!res.ok) await parseError(res, "Failed to draft contract heal");
  return res.json();
}

// ─── System info / efficiency / steward (added for hackathon polish) ───

export interface SystemInfo {
  demo_mode: boolean;
  judge_mode: boolean;
  steward_enabled: boolean;
  ai_sdk_host: string;
  is_sandbox: boolean;
  auth_mode?: string;
  conversation_backend?: "ai_sdk" | "local_sqlite";
  personas_supported?: boolean;
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const res = await fetch(`${BASE}/api/system/info`);
  if (!res.ok) throw new Error("Failed to fetch system info");
  return res.json();
}

export interface EfficiencySnapshot {
  semantic_searches: number;
  results_returned: number;
  results_used_top_k: number;
  results_skipped: number;
  tokens_avoided: number;
  full_scans_avoided: number;
  estimated_usd_saved: number;
}

export async function fetchEfficiency(): Promise<EfficiencySnapshot> {
  const res = await fetch(`${BASE}/api/metrics/efficiency`);
  if (!res.ok) throw new Error("Failed to fetch efficiency metrics");
  return res.json();
}

// ─── Governance writebacks ───

export interface SchemaDriftChange {
  ts: string;
  version: string;
  kind: string;
  column: string;
  details: string;
  by: string;
}

export interface SchemaDriftTimeline {
  demo?: boolean;
  entity_fqn: string;
  version_count: number;
  first_seen?: string;
  last_changed?: string;
  changes: SchemaDriftChange[];
  summary: { additions: number; renames: number; type_changes: number; drops: number };
  error?: string;
}

export async function fetchSchemaDrift(entityFqn: string, limit = 20): Promise<SchemaDriftTimeline> {
  const res = await fetch(
    `${BASE}/api/governance/schema-drift?entity_fqn=${encodeURIComponent(entityFqn)}&limit=${limit}`
  );
  if (!res.ok) await parseError(res, "Failed to fetch schema drift");
  return res.json();
}

export interface HealthScoreResult {
  demo?: boolean;
  ok: boolean;
  entity_fqn: string;
  property: string;
  score: number;
  breakdown: Record<string, number>;
  written_at: string;
  om_url?: string;
  note?: string;
  error?: string;
}

export async function writeHealthScore(
  entityFqn: string,
  score: number,
  breakdown: Record<string, number>
): Promise<HealthScoreResult> {
  const res = await fetch(`${BASE}/api/governance/health-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_fqn: entityFqn, score, breakdown }),
  });
  if (!res.ok) await parseError(res, "Failed to write health score");
  return res.json();
}

// ─── Steward (autonomous loop) ───

export interface StewardState {
  running: boolean;
  enabled: boolean;
  loop_count: number;
  last_run?: string | null;
  next_run?: string | null;
  interval_seconds?: number;
  events_seen?: number;
  actions_taken?: number;
}

export async function fetchStewardState(): Promise<StewardState> {
  const res = await fetch(`${BASE}/api/steward/state`);
  if (!res.ok) await parseError(res, "Failed to fetch steward state");
  return res.json();
}

export interface StewardDigest {
  date: string;
  events: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
}

export async function fetchStewardDigest(): Promise<StewardDigest> {
  const res = await fetch(`${BASE}/api/steward/digest`);
  if (!res.ok) await parseError(res, "Failed to fetch steward digest");
  return res.json();
}

export async function startSteward(): Promise<StewardState> {
  const res = await fetch(`${BASE}/api/steward/start`, { method: "POST" });
  if (!res.ok) await parseError(res, "Failed to start steward");
  return res.json();
}

export async function stopSteward(): Promise<StewardState> {
  const res = await fetch(`${BASE}/api/steward/stop`, { method: "POST" });
  if (!res.ok) await parseError(res, "Failed to stop steward");
  return res.json();
}

// ─── Personas (AI Studio) ───

export interface PersonaInfo {
  name: string;
  display_name?: string;
  description?: string;
  specialist?: string;
}

export interface PersonasList {
  backend: "ai_sdk" | "local";
  personas: PersonaInfo[];
}

export interface PersonasPublishResult {
  backend: string;
  created: number;
  updated: number;
  failed: number;
  total: number;
  published_at: string;
}

export async function fetchPersonas(): Promise<PersonasList> {
  const res = await fetch(`${BASE}/api/personas`);
  if (!res.ok) await parseError(res, "Failed to list personas");
  return res.json();
}

export async function publishPersonas(): Promise<PersonasPublishResult> {
  const res = await fetch(`${BASE}/api/personas/publish`, { method: "POST" });
  if (!res.ok) await parseError(res, "Failed to publish personas");
  return res.json();
}

export async function invokePersona(name: string, message: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${BASE}/api/personas/${encodeURIComponent(name)}/invoke?message=${encodeURIComponent(message)}`,
    { method: "POST" }
  );
  if (!res.ok) await parseError(res, "Failed to invoke persona");
  return res.json();
}

// ─── Auth admin ───

export interface AuthStatus {
  mode: "personal_access_token" | "oauth_client_credentials" | "none";
  token_present: boolean;
  expires_in?: number | null;
  expires_at?: string | null;
  refresh_skew_seconds?: number;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${BASE}/api/system/auth`);
  if (!res.ok) await parseError(res, "Failed to fetch auth status");
  return res.json();
}

export async function refreshAuthToken(): Promise<AuthStatus & { refreshed: boolean; has_token: boolean }> {
  const res = await fetch(`${BASE}/api/system/auth/refresh`, { method: "POST" });
  if (!res.ok) await parseError(res, "Failed to refresh auth token");
  return res.json();
}

// ─── Connector export ───

export async function fetchConnectorExport(): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/connector/export`);
  if (!res.ok) await parseError(res, "Failed to export connector data");
  return res.json();
}

// ─── Metrics scan ───

export interface MetricsScan {
  generated_at?: string;
  total_tables_scanned?: number;
  pii?: { gaps: number; coverage_pct: number };
  contracts?: { with_contract: number; coverage_pct: number };
  dq?: { passing: number; failing: number; pass_rate_pct: number };
  ownership?: { with_owner: number; coverage_pct: number };
  [k: string]: unknown;
}

export async function fetchMetricsScan(sampleTables = 200): Promise<MetricsScan> {
  const res = await fetch(`${BASE}/api/metrics/scan?sample_tables=${sampleTables}`);
  if (!res.ok) await parseError(res, "Failed to scan metrics");
  return res.json();
}

