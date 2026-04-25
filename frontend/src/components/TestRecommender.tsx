/**
 * Test Recommender — suggest + one-click-create DQ tests.
 *
 * Pulls recommendations from the backend, lets user preview the payload
 * that will be sent to OpenMetadata, and creates the test on approval.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Search,
  CheckCircle2,
  X,
  Eye,
  Sparkles,
  Shield,
  Database,
  BarChart3,
} from "lucide-react";
import { fetchRecommendations, createTestCase } from "../lib/api";
import type { DqRecommendation, DqRecommendationList } from "../lib/types";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const RECOMMENDER_FLOW_NODES: FlowNodeSpec[] = [
  { id: "table", tone: "data", label: "Target Table", sublabel: "FQN input", icon: Database, col: 0 },
  { id: "profile", tone: "process", label: "Profiler Stats", sublabel: "nulls / dist / patterns", icon: BarChart3, col: 1 },
  { id: "agent", tone: "agent", label: "Test Recommender", sublabel: "draft DQ rules", icon: Sparkles, col: 2 },
  { id: "create", tone: "output", label: "Materialize Tests", sublabel: "OM test cases", icon: Shield, col: 3 },
];

const RECOMMENDER_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "table", to: "profile" },
  { from: "profile", to: "agent", label: "context" },
  { from: "agent", to: "create" },
];

interface Props {
  initialTableFqn?: string;
}

export default function TestRecommender({
  initialTableFqn = "sample_db_service.ecommerce_db.shopify.dim_customer",
}: Readonly<Props>) {
  const [tableFqn, setTableFqn] = useState(initialTableFqn);
  const [input, setInput] = useState(initialTableFqn);
  const [data, setData] = useState<DqRecommendationList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<DqRecommendation | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setDismissed(new Set());
    setCreated({});
    try {
      const d = await fetchRecommendations(target);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tableFqn);
  }, [tableFqn, load]);

  // Close preview modal on Escape
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const handleApprove = async (rec: DqRecommendation) => {
    setCreating(rec.id);
    try {
      const result = await createTestCase(tableFqn, rec);
      setCreated((prev) => ({
        ...prev,
        [rec.id]: result.created
          ? "Created in OpenMetadata"
          : result.demo
            ? "Demo: preview ready"
            : "Saved",
      }));
    } catch (e) {
      setCreated((prev) => ({
        ...prev,
        [rec.id]: `Failed: ${e instanceof Error ? e.message : "unknown"}`,
      }));
    } finally {
      setCreating(null);
    }
  };

  const handleDismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const visibleRecs = data?.recommendations.filter((r) => !dismissed.has(r.id)) || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 md:px-6 pt-4 pb-3 border-b border-white/[0.04]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTableFqn(input.trim() || initialTableFqn);
          }}
          className="flex items-center gap-2 flex-1"
        >
          <div className="relative flex-1 max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="table FQN"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-1/60 border border-white/[0.08] rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/40"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 rounded-lg transition"
          >
            Analyze
          </button>
        </form>
        {data?.demo && (
          <span className="px-2 py-1 text-[10px] uppercase tracking-wider bg-zinc-700/50 text-zinc-400 rounded border border-zinc-600/40 font-mono">
            offline fallback
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto mb-6">
          <MiniFlow nodes={RECOMMENDER_FLOW_NODES} edges={RECOMMENDER_FLOW_EDGES} height={200} />
        </div>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
        {data && !loading && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center">
                <Sparkles size={18} className="text-brand-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-100">
                  {visibleRecs.length} test suggestions
                </h2>
                <p className="text-xs text-zinc-500 break-all">{data.table_fqn}</p>
              </div>
            </div>

            {visibleRecs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                All recommendations handled. Add more tables to continue.
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleRecs.map((rec) => (
                  <RecCard
                    key={rec.id}
                    rec={rec}
                    createdMessage={created[rec.id]}
                    isCreating={creating === rec.id}
                    onApprove={() => handleApprove(rec)}
                    onDismiss={() => handleDismiss(rec.id)}
                    onPreview={() => setPreview(rec)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-w-2xl w-full bg-surface-1 border border-white/[0.08] rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-zinc-100">Test Preview</h3>
              <button
                onClick={() => setPreview(null)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition"
              >
                <X size={16} />
              </button>
            </div>
            <pre className="text-[11px] font-mono text-zinc-300 bg-surface-2/60 p-4 rounded-lg border border-white/[0.04] overflow-auto max-h-96">
              {JSON.stringify(
                {
                  name: `${preview.test_type}_${preview.column ?? "table"}`,
                  testDefinition: preview.test_type,
                  entityLink: preview.column
                    ? `<#E::table::${tableFqn}::columns::${preview.column}>`
                    : `<#E::table::${tableFqn}>`,
                  parameterValues: Object.entries(preview.params).map(([name, value]) => ({
                    name,
                    value: String(value),
                  })),
                },
                null,
                2
              )}
            </pre>
            <p className="text-[11px] text-zinc-500 mt-3">
              This payload will be POSTed to <code className="text-brand-400">/api/v1/dataQuality/testCases</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function RecCard({
  rec,
  createdMessage,
  isCreating,
  onApprove,
  onDismiss,
  onPreview,
}: Readonly<{
  rec: DqRecommendation;
  createdMessage?: string;
  isCreating: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onPreview: () => void;
}>) {
  return (
    <div className="rounded-lg bg-surface-1/40 border border-white/[0.06] p-4 hover:border-brand-500/30 transition">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
          <Shield size={14} className="text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-zinc-200 font-mono">{rec.test_type}</span>
            {rec.column && (
              <span className="text-xs text-zinc-500">
                on <code className="text-brand-400">{rec.column}</code>
              </span>
            )}
            <span className="ml-auto text-[10px] text-zinc-500 font-mono">
              {Math.round(rec.confidence * 100)}%
            </span>
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed">{rec.rationale}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={onPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06] rounded transition"
            >
              <Eye size={12} />
              Preview
            </button>
            {createdMessage ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-400">
                <CheckCircle2 size={12} />
                {createdMessage}
              </span>
            ) : (
              <>
                <button
                  onClick={onApprove}
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-brand-500/20 hover:bg-brand-500/30 disabled:opacity-50 text-brand-300 border border-brand-500/30 rounded transition"
                >
                  {isCreating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  Approve &amp; Create
                </button>
                <button
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
