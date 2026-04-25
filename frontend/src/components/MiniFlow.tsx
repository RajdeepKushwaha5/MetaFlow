/**
 * MiniFlow — compact React Flow visualization for page headers.
 *
 * Renders a static, non-editable flow diagram from a simple nodes + edges
 * description. Used to illustrate the pipeline/data-flow for a feature
 * (e.g. Governance, Contract Copilot, About scenarios) in a consistent
 * visual language across the app.
 */

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LucideIcon } from "lucide-react";

export type FlowTone = "input" | "process" | "agent" | "output" | "data";

export interface FlowNodeSpec {
  id: string;
  label: string;
  sublabel?: string;
  icon?: LucideIcon;
  tone: FlowTone;
  /** 0-based column for horizontal positioning. */
  col: number;
  /** 0-based row offset within a column (useful when two nodes fan out). */
  row?: number;
}

export interface FlowEdgeSpec {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
  dashed?: boolean;
}

const TONE_STYLE: Record<FlowTone, { border: string; bg: string; text: string; ring: string }> = {
  input:   { border: "#3b82f6", bg: "rgba(59,130,246,0.08)",  text: "#93c5fd", ring: "rgba(59,130,246,0.25)" },
  process: { border: "#f59e0b", bg: "rgba(245,158,11,0.08)",  text: "#fcd34d", ring: "rgba(245,158,11,0.25)" },
  agent:   { border: "#10b981", bg: "rgba(16,185,129,0.08)",  text: "#6ee7b7", ring: "rgba(16,185,129,0.25)" },
  output:  { border: "#a855f7", bg: "rgba(168,85,247,0.08)",  text: "#d8b4fe", ring: "rgba(168,85,247,0.25)" },
  data:    { border: "#06b6d4", bg: "rgba(6,182,212,0.08)",   text: "#67e8f9", ring: "rgba(6,182,212,0.25)" },
};

const COL_WIDTH = 220;
const ROW_HEIGHT = 110;

interface NodeCardProps {
  data: {
    label: string;
    sublabel?: string;
    icon?: LucideIcon;
    tone: FlowTone;
  };
}

function NodeCard({ data }: Readonly<NodeCardProps>) {
  const { label, sublabel, icon: Icon, tone } = data;
  const s = TONE_STYLE[tone];
  return (
    <div
      className="rounded-xl px-4 py-3 backdrop-blur-sm min-w-[170px]"
      style={{
        backgroundColor: s.bg,
        border: `1px solid ${s.border}40`,
        boxShadow: `0 0 0 1px ${s.ring}, 0 2px 18px ${s.ring}`,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: s.border, width: 6, height: 6, border: "none", opacity: 0.7 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: s.border, width: 6, height: 6, border: "none", opacity: 0.7 }}
      />
      <div className="flex items-center gap-2">
        {Icon && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${s.border}20`, border: `1px solid ${s.border}35` }}
          >
            <Icon size={14} style={{ color: s.text }} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-tight text-white truncate">{label}</div>
          {sublabel && (
            <div className="text-[10px] font-mono text-zinc-400 leading-tight mt-0.5 truncate">{sublabel}</div>
          )}
        </div>
      </div>
      <div
        className="mt-2 text-[9px] uppercase tracking-wider font-semibold opacity-60"
        style={{ color: s.text }}
      >
        {tone}
      </div>
    </div>
  );
}

const nodeTypes = { card: NodeCard };

interface Props {
  readonly nodes: readonly FlowNodeSpec[];
  readonly edges: readonly FlowEdgeSpec[];
  /** Height of the flow canvas in pixels. */
  readonly height?: number;
  /** Background color override for the canvas card. */
  readonly className?: string;
}

export default function MiniFlow({ nodes, edges, height = 260, className = "" }: Props) {
  const flowNodes: Node[] = useMemo(() => {
    // Count rows per column to center vertically when col has multiple rows.
    const rowsPerCol = new Map<number, number>();
    nodes.forEach((n) => {
      const current = rowsPerCol.get(n.col) ?? 0;
      rowsPerCol.set(n.col, Math.max(current, (n.row ?? 0) + 1));
    });
    const maxRows = Math.max(...Array.from(rowsPerCol.values()));
    const canvasHeight = maxRows * ROW_HEIGHT;

    return nodes.map((n) => {
      const rowsInCol = rowsPerCol.get(n.col) ?? 1;
      const colHeight = rowsInCol * ROW_HEIGHT;
      const yCenterOffset = (canvasHeight - colHeight) / 2;
      const y = yCenterOffset + (n.row ?? 0) * ROW_HEIGHT;
      return {
        id: n.id,
        type: "card",
        position: { x: n.col * COL_WIDTH, y },
        data: { label: n.label, sublabel: n.sublabel, icon: n.icon, tone: n.tone },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: false,
      };
    });
  }, [nodes]);

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => ({
        id: `e-${i}-${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        label: e.label,
        animated: e.animated ?? true,
        type: "smoothstep",
        style: {
          stroke: e.dashed ? "#34d399" : "#10b981",
          strokeWidth: 2.25,
          strokeDasharray: e.dashed ? "5 4" : undefined,
        },
        labelStyle: { fill: "#d1fae5", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "rgba(4,20,12,0.85)", fillOpacity: 1 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#10b981",
          width: 22,
          height: 22,
          strokeWidth: 1,
        },
      })),
    [edges]
  );

  return (
    <div
      className={`rounded-xl border border-white/[0.06] bg-surface/60 overflow-hidden ${className}`}
      style={{ height }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll={false}
        panOnDrag={false}
        zoomOnDoubleClick={false}
      >
        <Background gap={24} size={1} color="rgba(255,255,255,0.03)" />
      </ReactFlow>
    </div>
  );
}
