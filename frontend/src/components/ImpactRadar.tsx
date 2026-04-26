/**
 * Impact Radar — React Flow visualization of lineage blast radius.
 *
 * Shows a failing entity at the center with upstream (red) and downstream
 * (orange → yellow) nodes colored by layer + type. Clicking a node surfaces
 * its metadata. The overall impact score drives a badge in the top-right.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Loader2,
  AlertTriangle,
  Table,
  BarChart2,
  GitBranch,
  Radio,
  Search,
  Flame,
} from "lucide-react";
import { fetchImpact } from "../lib/api";
import type { ImpactGraph, ImpactNode } from "../lib/types";

const LAYER_X = {
  "-1": 0,
  "0": 340,
  "1": 680,
  "2": 1020,
  "3": 1360,
} as const;

const TYPE_ICONS: Record<string, typeof Table> = {
  table: Table,
  dashboard: BarChart2,
  pipeline: GitBranch,
  topic: Radio,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function nodeColor(node: ImpactNode): { bg: string; border: string; text: string } {
  if (node.failing) return { bg: "#7f1d1d", border: "#ef4444", text: "#fecaca" };
  if (node.layer < 0) return { bg: "#1e3a8a", border: "#3b82f6", text: "#bfdbfe" };
  if (node.type === "dashboard") return { bg: "#713f12", border: "#eab308", text: "#fef08a" };
  if (node.type === "pipeline") return { bg: "#581c87", border: "#a855f7", text: "#e9d5ff" };
  return { bg: "#14532d", border: "#22c55e", text: "#bbf7d0" };
}

interface Props {
  initialFqn?: string;
}

export default function ImpactRadar({
  initialFqn = "sample_db_service.ecommerce_db.shopify.dim_customer",
}: Readonly<Props>) {
  const [fqn, setFqn] = useState(initialFqn);
  const [input, setInput] = useState(initialFqn);
  const [data, setData] = useState<ImpactGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImpactNode | null>(null);

  const load = useCallback(async (target: string) => {
    const normalized = target.trim() || initialFqn;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelected(null);
    try {
      const g = await fetchImpact(normalized);
      setData(g);
      setFqn(normalized);
      setInput(normalized);
      setNotice(`Impact scan complete for ${normalized}.`);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load impact");
    } finally {
      setLoading(false);
    }
  }, [initialFqn]);

  useEffect(() => {
    load(initialFqn);
  }, [initialFqn, load]);

  const handleScan = useCallback(() => {
    const target = input.trim() || initialFqn;
    void load(target);
  }, [initialFqn, input, load]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!data) return { nodes: [], edges: [] };

    // Group nodes by layer → spread vertically
    const byLayer = new Map<number, ImpactNode[]>();
    for (const n of data.nodes) {
      if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
      byLayer.get(n.layer)!.push(n);
    }

    const flowNodes: Node[] = [];
    for (const [layer, group] of byLayer.entries()) {
      const layerKey = String(layer) as keyof typeof LAYER_X;
      const xBase = LAYER_X[layerKey] ?? 340 + layer * 340;
      const totalH = group.length * 100;
      group.forEach((n, i) => {
        const colors = nodeColor(n);
        const y = -totalH / 2 + i * 100;
        flowNodes.push({
          id: n.fqn,
          position: { x: xBase, y },
          data: {
            label: (
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wider opacity-70 font-mono">
                  {n.type}
                </div>
                <div className="text-xs font-semibold truncate max-w-[180px]">
                  {n.fqn.split(".").pop()}
                </div>
                {n.service && (
                  <div className="text-[9px] opacity-60 truncate max-w-[180px]">{n.service}</div>
                )}
              </div>
            ),
          },
          style: {
            background: colors.bg,
            color: colors.text,
            border: `2px solid ${colors.border}`,
            borderRadius: 10,
            padding: 10,
            width: 210,
            fontSize: 12,
            boxShadow: n.failing ? "0 0 24px rgba(239,68,68,0.5)" : undefined,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });
    }

    const flowEdges: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: "#f97316", strokeWidth: 1.5, opacity: 0.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [data]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const found = data?.nodes.find((n) => n.fqn === node.id) ?? null;
      setSelected(found);
    },
    [data]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: search + score */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center px-4 md:px-6 pt-4 pb-3 border-b border-white/[0.04]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleScan();
          }}
          className="flex items-center gap-2 flex-1"
        >
          <div className="relative flex-1 max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="entity FQN (e.g. sample_db_service.ecommerce_db.shopify.dim_customer)"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-1/60 border border-white/[0.08] rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-brand-500/20 hover:bg-brand-500/30 disabled:opacity-60 text-brand-300 border border-brand-500/30 rounded-lg transition"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Scanning
              </span>
            ) : (
              "Scan"
            )}
          </button>
        </form>

        {data && (
          <div className="flex items-center gap-2">
            {data.demo && (
              <span className="px-2 py-1 text-[10px] uppercase tracking-wider bg-zinc-700/50 text-zinc-400 rounded border border-zinc-600/40 font-mono">
                offline fallback
              </span>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${SEVERITY_COLORS[data.severity]}`}>
              <Flame size={14} />
              <span className="text-xs font-semibold uppercase tracking-wider">{data.severity}</span>
              <span className="text-sm font-bold">{data.score}/100</span>
            </div>
          </div>
        )}
      </div>
      {notice && !error && (
        <div className="px-4 md:px-6 py-2 border-b border-white/[0.04] text-xs text-brand-200 bg-brand-500/10">
          {notice}
        </div>
      )}

      {/* Main area: graph + side panel */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 relative bg-surface-2/30 min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface/60 backdrop-blur-sm">
              <Loader2 size={28} className="animate-spin text-brand-400" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle size={16} />
                {error}
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={20} />
            <Controls className="!bg-surface-1 !border-white/[0.08]" />
          </ReactFlow>
        </div>

        {/* Side panel */}
        <aside className="w-full lg:w-[340px] border-t lg:border-t-0 lg:border-l border-white/[0.04] bg-surface-1/40 backdrop-blur-xl p-4 overflow-y-auto">
          {data && (
            <>
              <h3 className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-3">
                Impact Breakdown
              </h3>
              <div className="space-y-2 mb-5">
                <StatRow label="Downstream tables" value={data.breakdown.downstream_tables} />
                <StatRow label="Dashboards affected" value={data.breakdown.downstream_dashboards} highlight />
                <StatRow label="Pipelines" value={data.breakdown.downstream_pipelines} />
                <StatRow label="Total consumers" value={data.breakdown.total_consumers} highlight />
                <StatRow label="Criticality tier" value={data.breakdown.criticality_tier} />
                <StatRow label="Hours since failure" value={data.breakdown.hours_since_last_failure} />
              </div>

              <div className="p-3 rounded-lg bg-surface-2/50 border border-white/[0.04] mb-5">
                <p className="text-[11px] text-zinc-400 leading-relaxed">{data.explanation}</p>
              </div>

              {selected && (
                <div className="p-3 rounded-lg bg-brand-500/[0.05] border border-brand-500/[0.15]">
                  <h4 className="text-xs uppercase tracking-wider text-brand-400 font-semibold mb-2">
                    Selected node
                  </h4>
                  <NodeDetail node={selected} />
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }: Readonly<{ label: string; value: number; highlight?: boolean }>) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono font-semibold ${highlight ? "text-brand-300" : "text-zinc-200"}`}>
        {typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : value}
      </span>
    </div>
  );
}

function NodeDetail({ node }: Readonly<{ node: ImpactNode }>) {
  const Icon = TYPE_ICONS[node.type] || Table;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-brand-400" />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
          {node.type}
        </span>
      </div>
      <p className="text-sm font-semibold text-zinc-200 break-all">{node.fqn}</p>
      <p className="text-[11px] text-zinc-500">Service: {node.service || "—"}</p>
      <p className="text-[11px] text-zinc-500">Layer: {node.layer}</p>
      {node.consumers !== undefined && (
        <p className="text-[11px] text-brand-400">~{node.consumers} weekly consumers</p>
      )}
    </div>
  );
}
