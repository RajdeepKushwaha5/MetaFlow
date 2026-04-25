import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Database,
  FileText,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCcw,
  Send,
  Shield,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import {
  createContractTestCases,
  fetchContract,
  fetchContractStatus,
  proposeContractHeal,
  publishContract,
} from "../lib/api";
import type {
  ContractHealResponse,
  ContractQualityGate,
  ContractResponse,
  ContractStatusResponse,
  CreateTestCasesResult,
  PublishContractResult,
} from "../lib/types";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const CONTRACT_FLOW_NODES: FlowNodeSpec[] = [
  { id: "entity", tone: "data", label: "Target Entity", sublabel: "table FQN", icon: Database, col: 0 },
  { id: "lineage", tone: "process", label: "Lineage + Profiler", sublabel: "OM metadata", icon: GitBranch, col: 1 },
  { id: "draft", tone: "agent", label: "Contract Agent", sublabel: "generate spec v1.12", icon: Sparkles, col: 2 },
  { id: "om", tone: "output", label: "OpenMetadata", sublabel: "publish contract", icon: Shield, col: 3, row: 0 },
  { id: "tests", tone: "output", label: "Test Cases", sublabel: "materialize gates", icon: Check, col: 3, row: 1 },
  { id: "heal", tone: "output", label: "Remediation PR", sublabel: "auto-draft on violation", icon: GitPullRequest, col: 3, row: 2 },
];

const CONTRACT_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "entity", to: "lineage" },
  { from: "lineage", to: "draft", label: "context" },
  { from: "draft", to: "om" },
  { from: "draft", to: "tests" },
  { from: "draft", to: "heal", dashed: true },
];

const DEFAULT_ENTITY = "sample_db_service.ecommerce_db.shopify.dim_customer";

function normalizeEntityFqn(value: string) {
  const trimmed = value.trim().replace(/^[`'"]|[`'"]$/g, "");
  const withoutPrefix = trimmed.replace(/^(for|table|entity|fqn|contract\s+for|use)\s+/i, "").trim();
  const candidates = withoutPrefix.match(/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}/g);
  return candidates ? candidates[candidates.length - 1] : withoutPrefix;
}

const SEVERITY_COLORS: Record<string, string> = {
  blocker: "bg-red-500/15 text-red-300 border-red-500/40",
  major: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  minor: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Draft: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  Violated: "bg-red-500/15 text-red-300 border-red-500/40 animate-pulse",
  "Not Found": "bg-slate-500/15 text-slate-300 border-slate-500/40",
  Unknown: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
  Error: "bg-red-500/15 text-red-300 border-red-500/40",
};

function GateRow({ gate }: { readonly gate: ContractQualityGate }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="font-mono text-slate-300">{gate.name}</span>
        <span className="text-slate-500">→</span>
        <span className="text-slate-300">{gate.test}</span>
      </div>
      <span
        className={`rounded border px-1.5 py-0.5 uppercase tracking-wide ${SEVERITY_COLORS[gate.severity] ?? SEVERITY_COLORS.minor}`}
      >
        {gate.severity}
      </span>
    </div>
  );
}

export default function ContractCopilot() {
  const [entityFqn, setEntityFqn] = useState(DEFAULT_ENTITY);
  const [contract, setContract] = useState<ContractResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishContractResult | null>(null);

  const [creatingTests, setCreatingTests] = useState(false);
  const [testsResult, setTestsResult] = useState<CreateTestCasesResult | null>(null);

  const [status, setStatus] = useState<ContractStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [violation, setViolation] = useState("Null rate on `customer_id` exceeded threshold (0.6% > 0.1%)");
  const [healing, setHealing] = useState(false);
  const [heal, setHeal] = useState<ContractHealResponse | null>(null);

  const [copied, setCopied] = useState(false);
  const pollRef = useRef<number | null>(null);

  // ── Generate ─────────────────────────────────────────────────────────────
  const onGenerate = useCallback(
    async (fqn: string) => {
      const normalizedFqn = normalizeEntityFqn(fqn);
      setEntityFqn(normalizedFqn);
      setLoading(true);
      setError(null);
      setPublishResult(null);
      setTestsResult(null);
      setStatus(null);
      setHeal(null);
      try {
        const data = await fetchContract(normalizedFqn);
        setContract(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate contract");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    onGenerate(DEFAULT_ENTITY);
  }, [onGenerate]);

  // ── Status polling ────────────────────────────────────────────────────────
  const refreshStatus = useCallback(async (fqn: string) => {
    setStatusLoading(true);
    try {
      const data = await fetchContractStatus(fqn);
      setStatus(data);
    } catch {
      setStatus({ entity_fqn: fqn, found: false, status: "Error", message: "fetch failed" });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!publishResult?.published) return;
    const fqn = contract?.entity_fqn ?? normalizeEntityFqn(entityFqn);
    refreshStatus(fqn);
    pollRef.current = window.setInterval(() => refreshStatus(fqn), 10_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [publishResult, contract?.entity_fqn, entityFqn, refreshStatus]);

  // ── Publish + materialize ────────────────────────────────────────────────
  const onPublish = useCallback(async () => {
    if (!contract) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await publishContract(contract.entity_fqn, contract.contract);
      setPublishResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }, [contract]);

  const onCreateTests = useCallback(async () => {
    if (!contract) return;
    setCreatingTests(true);
    setTestsResult(null);
    try {
      const res = await createContractTestCases(contract.entity_fqn, contract.contract);
      setTestsResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Materialize failed");
    } finally {
      setCreatingTests(false);
    }
  }, [contract]);

  // ── Heal ─────────────────────────────────────────────────────────────────
  const onHeal = useCallback(async () => {
    if (!contract) return;
    setHealing(true);
    setHeal(null);
    try {
      const res = await proposeContractHeal(contract.entity_fqn, violation);
      setHeal(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Heal proposal failed");
    } finally {
      setHealing(false);
    }
  }, [contract, violation]);

  const onCopyYaml = useCallback(async () => {
    if (!contract) return;
    await navigator.clipboard.writeText(contract.yaml);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [contract]);

  const statusKey = status?.status ?? "Unknown";
  const statusClass = STATUS_COLORS[statusKey] ?? STATUS_COLORS.Unknown;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-zinc-950 via-violet-950/20 to-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Hero */}
        <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={28} className="text-violet-300" />
                <span className="text-violet-300 font-semibold tracking-wide">
                  Data Contract Copilot
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 leading-tight">
                Turn any table into a self-healing OpenMetadata contract.
              </h1>
              <p className="mt-3 text-zinc-400 max-w-2xl">
                Generate a contract from lineage + profiler stats. Publish it to
                OM. Materialize quality gates as test cases. Get an AI-drafted
                remediation PR the moment it&apos;s violated.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200">
              <Zap size={14} /> v1.12 spec
            </div>
          </div>

          <div className="mt-6 flex flex-col md:flex-row items-stretch gap-3">
            <input
              value={entityFqn}
              onChange={(e) => setEntityFqn(e.target.value)}
              onBlur={() => setEntityFqn((value) => normalizeEntityFqn(value))}
              onKeyDown={(e) => e.key === "Enter" && onGenerate(entityFqn)}
              placeholder="Enter table FQN (e.g. sample_db_service.ecommerce_db.shopify.dim_customer)"
              className="flex-1 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3 font-mono text-sm text-zinc-100 outline-none focus:border-violet-400/60"
            />
            <button
              type="button"
              onClick={() => onGenerate(entityFqn)}
              disabled={loading || !normalizeEntityFqn(entityFqn)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 px-5 py-3 text-sm font-semibold text-white"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "Generating…" : "Generate Contract"}
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </section>

        {/* Pipeline flow diagram */}
        <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Contract Pipeline</h2>
              <p className="text-xs text-zinc-500 mt-0.5">How MetaFlow turns an entity into a published, self-healing contract.</p>
            </div>
          </div>
          <MiniFlow nodes={CONTRACT_FLOW_NODES} edges={CONTRACT_FLOW_EDGES} height={320} />
        </section>

        {/* Status strip */}
        {publishResult?.published && (
          <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                Live status
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}
              >
                {statusKey}
              </span>
              {status?.last_evaluated && (
                <span className="text-xs text-zinc-500">
                  last evaluated {new Date(status.last_evaluated).toLocaleString()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => refreshStatus(entityFqn)}
              disabled={statusLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              <RefreshCcw size={12} className={statusLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </section>
        )}

        {/* Contract review */}
        {contract && (
          <section className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <FileText size={14} />
                  <span className="font-semibold">Generated contract (YAML)</span>
                  {contract.demo && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
                      offline fallback
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onCopyYaml}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="max-h-[500px] overflow-auto rounded-md bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300 font-mono">
                {contract.yaml}
              </pre>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Stats</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(contract.stats).map(([k, v]) => (
                    <div key={k} className="rounded border border-white/10 bg-black/30 p-2">
                      <div className="text-zinc-500">{k.replace(/_/g, " ")}</div>
                      <div className="text-lg font-semibold text-zinc-100">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Quality gates ({contract.contract.quality_gates.length})
                </h3>
                <div className="space-y-1.5 max-h-[260px] overflow-auto">
                  {contract.contract.quality_gates.map((g) => (
                    <GateRow key={g.name} gate={g} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={publishing}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white"
                >
                  {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Publish
                </button>
                <button
                  type="button"
                  onClick={onCreateTests}
                  disabled={creatingTests || !publishResult?.published}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white"
                >
                  {creatingTests ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  Materialize tests
                </button>
              </div>

              {publishResult && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200 space-y-1">
                  <div className="font-semibold">
                    {publishResult.published ? "Published ✓" : "Publish skipped"}
                  </div>
                  {publishResult.message && <div>{publishResult.message}</div>}
                  {publishResult.preview_url && (
                    <a
                      href={publishResult.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Open in OpenMetadata →
                    </a>
                  )}
                </div>
              )}

              {testsResult && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-200 space-y-1">
                  <div className="font-semibold">{testsResult.summary}</div>
                  <div className="text-zinc-400">
                    created {testsResult.created.length} · skipped{" "}
                    {testsResult.skipped.length} · failed {testsResult.failed.length}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Heal panel */}
        {publishResult?.published && (
          <section className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-200">
              <Wrench size={16} />
              <span className="text-sm font-semibold">Self-heal (when violated)</span>
            </div>
            <p className="text-xs text-zinc-400">
              Describe the violation and the Copilot will classify it, draft the
              SQL fix, and prepare a GitHub PR description ready to dispatch.
            </p>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={violation}
                onChange={(e) => setViolation(e.target.value)}
                placeholder="e.g. unique constraint failed on order_id"
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <button
                type="button"
                onClick={onHeal}
                disabled={healing || !violation.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-zinc-950"
              >
                {healing ? <Loader2 size={14} className="animate-spin" /> : <GitPullRequest size={14} />}
                Draft remediation PR
              </button>
            </div>

            {heal && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-zinc-500 mb-1">
                    Classified as <span className="text-amber-300 font-mono">{heal.classification}</span>
                  </div>
                  <pre className="text-[11px] text-zinc-300 font-mono whitespace-pre-wrap">
                    {heal.diff}
                  </pre>
                </div>
                <div className="rounded-md border border-white/10 bg-black/40 p-3 space-y-2">
                  <div className="text-xs text-zinc-500">PR draft</div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {heal.ticket_draft.title}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {heal.ticket_draft.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                  <pre className="max-h-[260px] overflow-auto text-[11px] text-zinc-400 font-mono whitespace-pre-wrap">
                    {heal.ticket_draft.body}
                  </pre>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
