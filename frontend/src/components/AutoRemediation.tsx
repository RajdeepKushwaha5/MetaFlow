import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  GitBranch,
  Github,
  Loader2,
  Send,
  Target,
  TrendingDown,
  User,
  Zap,
  Ticket,
} from "lucide-react";
import { fetchAutoRemediation, dispatchTicket } from "../lib/api";
import type {
  AutoRemediation as Remediation,
  DispatchTicketResult,
  DriftSignal,
  RemediationCandidate,
} from "../lib/types";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const DEFAULT_TEST =
  "sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email";

const REMEDIATION_FLOW_NODES: FlowNodeSpec[] = [
  { id: "test", tone: "input", label: "Failed Test", sublabel: "DQ violation", icon: Zap, col: 0 },
  { id: "lineage", tone: "process", label: "Lineage Walk", sublabel: "upstream cols", icon: GitBranch, col: 1 },
  { id: "agent", tone: "agent", label: "Remediation Agent", sublabel: "rank + draft fix", icon: Target, col: 2 },
  { id: "owner", tone: "data", label: "Owner Resolved", sublabel: "via OpenMetadata", icon: User, col: 3, row: 0 },
  { id: "gh", tone: "output", label: "GitHub Issue", sublabel: "auto-drafted", icon: Github, col: 3, row: 1 },
  { id: "jira", tone: "output", label: "Jira Ticket", sublabel: "auto-drafted", icon: Ticket, col: 3, row: 2 },
];

const REMEDIATION_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "test", to: "lineage", label: "trace" },
  { from: "lineage", to: "agent", label: "context" },
  { from: "agent", to: "owner" },
  { from: "agent", to: "gh" },
  { from: "agent", to: "jira", dashed: true },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

function SignalRow({ signal }: { readonly signal: DriftSignal }) {
  const delta = signal.delta_pct != null ? `${signal.delta_pct}%` : signal.delta != null ? signal.delta.toFixed(4) : "—";
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
        <span className="font-mono text-slate-300">{signal.metric}</span>
      </div>
      <div className="flex items-center gap-3 text-slate-400">
        <span>
          baseline <span className="text-slate-200">{String(signal.baseline ?? "—")}</span>
        </span>
        <span>→</span>
        <span>
          current <span className="text-slate-200">{String(signal.current ?? "—")}</span>
        </span>
        <span className={`rounded border px-1.5 py-0.5 ${SEVERITY_COLORS[signal.severity] ?? SEVERITY_COLORS.low}`}>
          Δ {delta}
        </span>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  isRoot,
}: {
  readonly candidate: RemediationCandidate;
  readonly isRoot: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isRoot
          ? "border-rose-500/40 bg-rose-500/5"
          : "border-white/10 bg-slate-900/40"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {isRoot && <Target className="h-4 w-4 text-rose-400" />}
            <span className="font-mono text-sm text-slate-100">
              {candidate.table_fqn}<span className="text-slate-500">.</span>{candidate.column}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <User className="h-3 w-3" />
            <span>
              owner: <span className="text-slate-200">{candidate.owner.name}</span>
              {candidate.owner.email ? ` · ${candidate.owner.email}` : ""}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Drift score</div>
          <div className={`text-2xl font-semibold ${isRoot ? "text-rose-300" : "text-slate-300"}`}>
            {candidate.drift_score.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {candidate.signals.length === 0 ? (
          <div className="text-xs text-slate-500">No significant signals detected.</div>
        ) : (
          candidate.signals.map((s) => <SignalRow key={s.metric} signal={s} />)
        )}
      </div>
    </div>
  );
}

export default function AutoRemediation() {
  const [testFqn, setTestFqn] = useState(DEFAULT_TEST);
  const [remediation, setRemediation] = useState<Remediation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<"github" | "jira" | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchTicketResult | null>(null);

  const load = useCallback(async (fqn: string) => {
    setLoading(true);
    setError(null);
    setDispatchResult(null);
    try {
      const data = await fetchAutoRemediation(fqn);
      setRemediation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(DEFAULT_TEST);
  }, [load]);

  const handleDispatch = async (target: "github" | "jira") => {
    if (!remediation) return;
    setDispatching(target);
    setDispatchResult(null);
    try {
      const result = await dispatchTicket(remediation, target);
      setDispatchResult(result);
    } catch (e) {
      setDispatchResult({
        created: false,
        error: e instanceof Error ? e.message : "Failed to dispatch",
      });
    } finally {
      setDispatching(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-transparent p-5">
        <div className="mb-1 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-rose-400" />
          <h2 className="text-lg font-semibold text-slate-100">Auto-Remediation</h2>
          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-300">
            Lineage-aware
          </span>
        </div>
        <p className="text-sm text-slate-400">
          When a DQ test fails, walk the column-level lineage upstream, rank upstream
          columns by profile drift, resolve the owner via OpenMetadata, and draft a
          GitHub issue + Jira ticket — all from one click.
        </p>
      </div>

      {/* Pipeline diagram */}
      <MiniFlow nodes={REMEDIATION_FLOW_NODES} edges={REMEDIATION_FLOW_EDGES} height={320} />

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(testFqn);
        }}
        className="flex gap-2"
      >
        <input
          value={testFqn}
          onChange={(e) => setTestFqn(e.target.value)}
          placeholder="Failing test FQN (e.g. sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email)"
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !testFqn}
          className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          Diagnose
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {remediation && (
        <div className="space-y-5">
          {/* Summary card */}
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Target</div>
                <div className="mt-1 font-mono text-sm text-slate-100">
                  {remediation.target_table}
                  {remediation.target_column && (
                    <span className="text-slate-400">.{remediation.target_column}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500">Confidence</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">
                  {Math.round(remediation.confidence * 100)}%
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{remediation.narrative}</p>
            {remediation.demo && (
              <div className="mt-3 inline-flex rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">
                Offline fallback — OpenMetadata not connected
              </div>
            )}
          </div>

          {/* Candidates */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              Upstream candidates ({remediation.candidates.length})
            </h3>
            <div className="space-y-3">
              {remediation.candidates.map((c, i) => (
                <CandidateCard key={c.table_fqn + c.column} candidate={c} isRoot={i === 0} />
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Timeline</h3>
            <ol className="space-y-2">
              {remediation.timeline.map((t) => (
                <li key={`${t.at}-${t.event}`} className="flex gap-3 text-xs">
                  <span className="w-16 shrink-0 font-mono text-slate-500">{t.at}</span>
                  <span className="text-slate-300">{t.event}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Drafted tickets */}
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Drafted tickets</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <Github className="h-4 w-4" /> GitHub Issue
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDispatch("github")}
                    disabled={dispatching !== null}
                    className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                  >
                    {dispatching === "github" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Send
                  </button>
                </div>
                <div className="mb-2 text-xs font-medium text-slate-200">
                  {remediation.suggested_tickets.github.title}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(remediation.suggested_tickets.github.labels ?? []).map((l) => (
                    <span key={l} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {l}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Assignee(s): {(remediation.suggested_tickets.github.assignees ?? []).join(", ") || "—"}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <AlertTriangle className="h-4 w-4" /> Jira Ticket
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDispatch("jira")}
                    disabled={dispatching !== null}
                    className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                  >
                    {dispatching === "jira" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Send
                  </button>
                </div>
                <div className="mb-2 text-xs font-medium text-slate-200">
                  {remediation.suggested_tickets.jira.summary}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>Project: {remediation.suggested_tickets.jira.project}</span>
                  <span>·</span>
                  <span>Priority: {remediation.suggested_tickets.jira.priority}</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Assignee: {remediation.suggested_tickets.jira.assignee || "—"}
                </div>
              </div>
            </div>

            {dispatchResult && (
              <div
                className={`mt-3 flex items-center gap-2 rounded border p-2 text-xs ${
                  dispatchResult.created
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                }`}
              >
                {dispatchResult.created ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>
                      {dispatchResult.demo ? "Drafted (demo)" : "Created"} on {dispatchResult.target}:
                    </span>
                    {dispatchResult.result?.url && (
                      <a
                        href={dispatchResult.result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {dispatchResult.result.url}
                      </a>
                    )}
                    {dispatchResult.result?.key && (
                      <span className="font-mono">{dispatchResult.result.key}</span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Failed: {dispatchResult.error ?? dispatchResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
