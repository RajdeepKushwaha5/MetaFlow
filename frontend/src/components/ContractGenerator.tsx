import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Database,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
} from "lucide-react";
import { fetchContract, publishContract } from "../lib/api";
import type {
  ContractResponse,
  ContractQualityGate,
  PublishContractResult,
} from "../lib/types";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const DEFAULT_ENTITY = "sample_db_service.ecommerce_db.shopify.dim_customer";

const CONTRACT_FLOW_NODES: FlowNodeSpec[] = [
  { id: "entity", tone: "data", label: "Target Entity", sublabel: "table FQN", icon: Database, col: 0 },
  { id: "lineage", tone: "process", label: "Lineage + Profiler", sublabel: "OM metadata", icon: GitBranch, col: 1 },
  { id: "agent", tone: "agent", label: "Contract Agent", sublabel: "synthesize spec", icon: Sparkles, col: 2 },
  { id: "yaml", tone: "output", label: "Contract YAML", sublabel: "v1.12 spec", icon: FileText, col: 3, row: 0 },
  { id: "om", tone: "output", label: "OpenMetadata", sublabel: "publish back", icon: Shield, col: 3, row: 1 },
];

const CONTRACT_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "entity", to: "lineage" },
  { from: "lineage", to: "agent", label: "context" },
  { from: "agent", to: "yaml" },
  { from: "agent", to: "om", dashed: true },
];

const SEVERITY_COLORS: Record<string, string> = {
  blocker: "bg-red-500/15 text-red-300 border-red-500/40",
  major: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  minor: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

function normalizeEntityFqn(value: string) {
  const trimmed = value.trim().replace(/^[`'"]|[`'"]$/g, "");
  const withoutPrefix = trimmed.replace(/^(for|table|entity|fqn|contract\s+for|use)\s+/i, "").trim();
  const candidates = withoutPrefix.match(/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}/g);
  return candidates ? candidates[candidates.length - 1] : withoutPrefix;
}

function QualityGateRow({ gate }: { readonly gate: ContractQualityGate }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-xs">
      <div className="grid min-w-0 grid-cols-[minmax(7rem,1fr)_auto_minmax(8rem,1.1fr)] items-center gap-2">
        <span className="truncate font-mono text-slate-300" title={gate.name}>
          {gate.name}
        </span>
        <span className="text-slate-500">→</span>
        <span className="truncate text-slate-300" title={gate.test}>
          {gate.test}
        </span>
      </div>
      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_COLORS[gate.severity]}`}>
        {gate.severity}
      </span>
    </div>
  );
}

export default function ContractGenerator() {
  const [entityFqn, setEntityFqn] = useState(DEFAULT_ENTITY);
  const [response, setResponse] = useState<ContractResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishContractResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (fqn: string) => {
    const normalized = normalizeEntityFqn(fqn) || DEFAULT_ENTITY;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPublishResult(null);
    try {
      const data = await fetchContract(normalized);
      setResponse(data);
      setEntityFqn(normalized);
      setNotice(`Generated contract for ${normalized}.`);
    } catch (e) {
      setResponse(null);
      setError(e instanceof Error ? e.message : "Failed to load contract");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(DEFAULT_ENTITY);
  }, [load]);

  const handleCopy = async () => {
    if (!response?.yaml) return;
    try {
      await navigator.clipboard.writeText(response.yaml);
      setCopied(true);
      setNotice("Contract YAML copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setNotice(`Copy failed: ${e instanceof Error ? e.message : "clipboard unavailable"}`);
    }
  };

  const handlePublish = async () => {
    if (!response) return;
    setPublishing(true);
    setPublishResult(null);
    setNotice(null);
    try {
      const result = await publishContract(response.entity_fqn, response.contract);
      setPublishResult(result);
      setNotice(
        result.message ||
          (result.published ? "Contract published to OpenMetadata." : "Publish request completed.")
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to publish";
      setPublishResult({
        published: false,
        message,
      });
      setNotice(message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent p-5">
        <div className="mb-1 flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-slate-100">Data Contract Generator</h2>
          <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
            Lineage + Profiler
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Pick a table or data product. MetaFlow walks its upstream lineage, pulls
          profiler stats for every column, synthesizes schema expectations + SLAs +
          quality gates, and emits a review-ready contract YAML that can be pushed
          back to OpenMetadata's Data Contract API.
        </p>
      </div>

      {/* Pipeline diagram */}
      <MiniFlow nodes={CONTRACT_FLOW_NODES} edges={CONTRACT_FLOW_EDGES} height={280} />

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(entityFqn);
        }}
        className="flex gap-2"
      >
        <input
          value={entityFqn}
          onChange={(e) => setEntityFqn(e.target.value)}
          onBlur={() => setEntityFqn((value) => normalizeEntityFqn(value) || DEFAULT_ENTITY)}
          placeholder="Entity FQN (e.g. sample_db_service.ecommerce_db.shopify.dim_customer)"
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !normalizeEntityFqn(entityFqn)}
          className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : response ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Generating" : response ? "Regenerate" : "Generate"}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {notice && !error && (
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
          {notice}
        </div>
      )}

      {response && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Upstream sources</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {response.stats.upstream_sources}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Columns analyzed</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {response.stats.columns_analyzed}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Schema fields</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {response.stats.schema_expectations}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Quality gates</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {response.stats.quality_gates}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
            <p className="text-sm leading-relaxed text-slate-300">{response.narrative}</p>
            {response.demo && (
              <div className="mt-3 inline-flex rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">
                Offline fallback — OpenMetadata not connected
              </div>
            )}
          </div>

          {/* Quality gates */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Quality gates</h3>
            <div className="space-y-1.5">
              {response.contract.quality_gates.map((g) => (
                <QualityGateRow key={g.name} gate={g} />
              ))}
            </div>
          </div>

          {/* SLA */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Service Level Agreement</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Freshness</div>
                <div className="mt-1 text-slate-200">
                  ≤ {response.contract.sla.freshness.max_lag_hours}h · {response.contract.sla.freshness.check}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Volume</div>
                <div className="mt-1 text-slate-200">
                  {response.contract.sla.volume.min_rows.toLocaleString()}–
                  {response.contract.sla.volume.max_rows.toLocaleString()} rows /{" "}
                  {response.contract.sla.volume.window}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Availability</div>
                <div className="mt-1 text-slate-200">{response.contract.sla.availability}</div>
              </div>
            </div>
          </div>

          {/* YAML */}
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <FileText className="h-4 w-4" /> contract.yaml
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!response.yaml}
                  className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {copied ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing || !response}
                  className="flex items-center gap-1 rounded bg-violet-500 px-2 py-1 text-xs text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {publishing ? "Pushing" : "Push to OpenMetadata"}
                </button>
              </div>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
              {response.yaml}
            </pre>
            {publishResult && (
              <div
                className={`mt-3 flex items-center gap-2 rounded border p-2 text-xs ${
                  publishResult.published
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                }`}
              >
                {publishResult.published ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>
                      {publishResult.demo ? "Staged (demo)" : "Published"} via{" "}
                      {publishResult.method ?? (publishResult.demo ? "preview" : "API")}
                      {publishResult.message ? ` — ${publishResult.message}` : "."}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{publishResult.message ?? "Publish failed"}</span>
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
