/**
 * Cause Tree — recursive expandable tree that explains a DQ test failure.
 *
 * The backend returns a nested tree of evidence. We render it as an indented
 * tree with colored "kind" badges and a narrative summary up top.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Zap,
  Search,
  Target,
  Clock,
  User,
  GitCommit,
  TrendingDown,
  GitBranch,
  Brain,
} from "lucide-react";
import { fetchCauseTree } from "../lib/api";
import type { CauseTree as CauseTreeData, CauseTreeNode } from "../lib/types";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const CAUSE_FLOW_NODES: FlowNodeSpec[] = [
  { id: "test", tone: "input", label: "Failed Test", sublabel: "DQ violation", icon: Zap, col: 0 },
  { id: "evidence", tone: "process", label: "Evidence Walk", sublabel: "lineage + history", icon: GitBranch, col: 1 },
  { id: "agent", tone: "agent", label: "RCA Agent", sublabel: "rank causes", icon: Brain, col: 2 },
  { id: "tree", tone: "output", label: "Cause Tree", sublabel: "narrative + nodes", icon: Target, col: 3 },
];

const CAUSE_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "test", to: "evidence" },
  { from: "evidence", to: "agent", label: "context" },
  { from: "agent", to: "tree" },
];

const KIND_STYLES: Record<string, { icon: typeof Zap; color: string }> = {
  failure: { icon: Zap, color: "text-red-400" },
  pattern: { icon: TrendingDown, color: "text-orange-400" },
  signal: { icon: TrendingDown, color: "text-yellow-400" },
  upstream: { icon: Target, color: "text-purple-400" },
  change: { icon: GitCommit, color: "text-blue-400" },
  context: { icon: Search, color: "text-zinc-400" },
  owner: { icon: User, color: "text-emerald-400" },
  history: { icon: Clock, color: "text-zinc-400" },
};

interface Props {
  initialTestFqn?: string;
}

export default function CauseTree({
  initialTestFqn = "sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email",
}: Readonly<Props>) {
  const [testFqn, setTestFqn] = useState(initialTestFqn);
  const [input, setInput] = useState(initialTestFqn);
  const [data, setData] = useState<CauseTreeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchCauseTree(target);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cause tree");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(testFqn);
  }, [testFqn, load]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 md:px-6 pt-4 pb-3 border-b border-white/[0.04]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTestFqn(input.trim() || initialTestFqn);
          }}
          className="flex items-center gap-2 flex-1"
        >
          <div className="relative flex-1 max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="test FQN (e.g. sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email)"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-1/60 border border-white/[0.08] rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/40"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 rounded-lg transition"
          >
            Explain
          </button>
        </form>
        {data?.demo && (
          <span className="px-2 py-1 text-[10px] uppercase tracking-wider bg-zinc-700/50 text-zinc-400 rounded border border-zinc-600/40 font-mono">
            offline fallback
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto mb-6">
          <MiniFlow nodes={CAUSE_FLOW_NODES} edges={CAUSE_FLOW_EDGES} height={200} />
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
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header card */}
            <div className="rounded-xl bg-gradient-to-br from-red-500/[0.08] to-orange-500/[0.05] border border-red-500/[0.15] p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <Zap size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-zinc-100 break-all">{data.test_name}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Status: {data.status}</p>
                </div>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {data.narrative}
              </p>
            </div>

            {/* Tree */}
            <div className="rounded-xl bg-surface-1/40 border border-white/[0.04] p-5">
              <h3 className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-4">
                Root-Cause Analysis
              </h3>
              <TreeNode node={data.tree} depth={0} defaultOpen />
            </div>

            {/* Suggested actions */}
            {data.suggested_actions.length > 0 && (
              <div className="rounded-xl bg-surface-1/40 border border-white/[0.04] p-5">
                <h3 className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-4">
                  Suggested Actions
                </h3>
                <div className="space-y-2">
                  {data.suggested_actions.map((a) => (
                    <div
                      key={a.label}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-2/50 border border-white/[0.04] hover:border-brand-500/30 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-brand-500/10 text-brand-400 rounded border border-brand-500/20 font-mono">
                          {a.kind}
                        </span>
                        <span className="text-sm text-zinc-200">{a.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {Math.round(a.confidence * 100)}% conf.
                        </span>
                        <button className="px-3 py-1 text-xs bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 rounded transition">
                          Run
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  defaultOpen = false,
}: Readonly<{ node: CauseTreeNode; depth: number; defaultOpen?: boolean }>) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const hasChildren = node.children.length > 0;
  const style = KIND_STYLES[node.kind] || KIND_STYLES.context;
  const Icon = style.icon;

  return (
    <div className={`${depth > 0 ? "border-l-2 border-white/[0.04] pl-4 ml-3" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!hasChildren}
        className={`flex items-start gap-2 w-full text-left py-1.5 group ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="w-4 flex items-center justify-center pt-0.5 shrink-0">
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300" />
            ) : (
              <ChevronRight size={14} className="text-zinc-500 group-hover:text-zinc-300" />
            )
          ) : (
            <div className="w-1 h-1 rounded-full bg-zinc-700" />
          )}
        </div>
        <Icon size={14} className={`${style.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-200 font-medium">{node.label}</span>
            {node.is_root_cause && (
              <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-red-500/20 text-red-300 rounded border border-red-500/40 font-mono">
                Root Cause
              </span>
            )}
          </div>
          {node.evidence && (
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono break-words">{node.evidence}</p>
          )}
        </div>
      </button>
      {open && hasChildren && (
        <div className="mt-1">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
