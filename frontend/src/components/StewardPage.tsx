import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Bot,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Database,
  ShieldCheck,
  FileText,
  Users,
  Workflow,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  fetchStewardState,
  fetchStewardDigest,
  startSteward,
  stopSteward,
  fetchAuthStatus,
  refreshAuthToken,
  fetchMetricsScan,
  type StewardState,
  type StewardDigest,
  type AuthStatus,
  type MetricsScan,
} from "../lib/api";

export default function StewardPage() {
  const [state, setState] = useState<StewardState | null>(null);
  const [digest, setDigest] = useState<StewardDigest | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [scan, setScan] = useState<MetricsScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [s, d, a] = await Promise.all([
        fetchStewardState().catch(() => null),
        fetchStewardDigest().catch(() => null),
        fetchAuthStatus().catch(() => null),
      ]);
      setState(s);
      setDigest(d);
      setAuth(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    fetchMetricsScan(100).then(setScan).catch(() => {});
    const t = setInterval(refreshAll, 15000);
    return () => clearInterval(t);
  }, []);

  const onStart = async () => {
    setBusy("start");
    try { setState(await startSteward()); } finally { setBusy(null); }
  };
  const onStop = async () => {
    setBusy("stop");
    try { setState(await stopSteward()); } finally { setBusy(null); }
  };
  const onRefreshAuth = async () => {
    setBusy("auth");
    try { setAuth(await refreshAuthToken()); } finally { setBusy(null); }
  };
  const onScan = async () => {
    setBusy("scan");
    try { setScan(await fetchMetricsScan(100)); } finally { setBusy(null); }
  };

  const running = state?.running ?? state?.enabled ?? false;

  const pollsVal =
    state?.loop_count ?? (state as unknown as { polls?: number })?.polls ?? 0;
  const intervalVal =
    state?.interval_seconds ?? (state as unknown as { poll_seconds?: number })?.poll_seconds ?? 0;

  const piiTotal =
    (scan?.pii?.columns_with_pii_tag ?? 0) +
    (scan?.pii?.columns_likely_pii_missing_tag ?? 0);
  const piiCov =
    scan?.pii?.coverage_pct ??
    (piiTotal > 0
      ? Math.round(((scan?.pii?.columns_with_pii_tag ?? 0) / piiTotal) * 1000) / 10
      : null);
  const contractCov =
    scan?.contracts?.coverage_pct ?? scan?.contracts?.contract_coverage_pct ?? null;
  const dqRate =
    scan?.dq?.pass_rate_pct ?? scan?.data_quality?.pass_rate_pct ?? null;
  const ownCov =
    scan?.ownership?.coverage_pct ?? scan?.ownership?.ownership_coverage_pct ?? null;
  const tablesScanned =
    scan?.total_tables_scanned ?? scan?.totals?.tables ?? null;

  const { nodes, edges } = useMemo(
    () => buildPipelineGraph(running, state, digest),
    [running, state, digest],
  );

  const dqTone: "ok" | "warn" | "bad" | "muted" = (() => {
    if (dqRate === null) return "muted";
    if (dqRate >= 90) return "ok";
    if (dqRate >= 75) return "warn";
    return "bad";
  })();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto p-6 md:p-8 space-y-6">
        {/* Header */}
        <header className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Bot size={20} className="text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight">Operations</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Continuous Data Steward &middot; Auth &amp; token status &middot; Real-data metrics scan.
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-300 flex items-center gap-2 transition"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        {/* KPI row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Bot size={14} />}
            label="Steward"
            value={running ? "Running" : "Stopped"}
            tone={running ? "ok" : "muted"}
          />
          <KpiCard
            icon={<KeyRound size={14} />}
            label="Auth"
            value={auth?.token_present ? "Ready" : "Missing"}
            tone={auth?.token_present ? "ok" : "warn"}
          />
          <KpiCard
            icon={<Database size={14} />}
            label="Tables scanned"
            value={tablesScanned?.toLocaleString() ?? "—"}
            tone="muted"
          />
          <KpiCard
            icon={<Activity size={14} />}
            label="DQ pass rate"
            value={dqRate !== null ? `${dqRate}%` : "—"}
            tone={dqTone}
          />
        </section>

        {/* Pipeline diagram */}
        <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <Workflow size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Steward pipeline</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                running
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
              }`}>
                {running ? "LIVE" : "IDLE"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onStart}
                disabled={running || busy === "start"}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-300 font-medium flex items-center gap-1.5 disabled:opacity-40 transition"
              >
                {busy === "start" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start
              </button>
              <button
                onClick={onStop}
                disabled={!running || busy === "stop"}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs text-red-300 font-medium flex items-center gap-1.5 disabled:opacity-40 transition"
              >
                {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Stop
              </button>
            </div>
          </div>
          <div className="h-[340px] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.04),transparent_60%)]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll={false}
            >
              <Background gap={24} color="#27272a" />
            </ReactFlow>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.04] border-t border-white/[0.04]">
            <MiniStat label="Loop runs" value={pollsVal.toLocaleString()} />
            <MiniStat label="Events seen" value={(state?.events_seen ?? 0).toLocaleString()} />
            <MiniStat label="Actions taken" value={(state?.actions_taken ?? 0).toLocaleString()} />
            <MiniStat label="Interval" value={intervalVal ? `${intervalVal}s` : "—"} />
          </div>
        </section>

        {/* Digest + Auth */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Daily digest</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Events captured today &amp; actions taken.
                </p>
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">{digest?.date ?? "—"}</span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <Chip label="Total" value={(digest?.totals?.events ?? 0).toString()} tone="muted" />
              <Chip label="Critical" value={(digest?.totals?.critical ?? 0).toString()} tone="bad" />
              <Chip label="Warning" value={(digest?.totals?.warning ?? 0).toString()} tone="warn" />
              <Chip label="Info" value={(digest?.totals?.info ?? 0).toString()} tone="ok" />
            </div>

            <DigestList
              title="Recent events"
              items={digest?.events ?? []}
              empty="No events captured yet. Start the steward to begin."
            />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <KeyRound size={14} /> Auth
              </h2>
              {auth?.mode === "oauth_client_credentials" && (
                <button
                  onClick={onRefreshAuth}
                  disabled={busy === "auth"}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-xs text-brand-300 font-medium flex items-center gap-1.5 disabled:opacity-40 transition"
                >
                  {busy === "auth" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Refresh
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              <Row label="Mode" value={auth?.mode ?? "—"} />
              <Row
                label="Token"
                value={auth?.token_present ? "present" : "missing"}
                accent={auth?.token_present ? "ok" : "bad"}
              />
              <Row label="Expires in" value={auth?.expires_in ? `${auth.expires_in}s` : "n/a"} />
              <Row label="Refresh skew" value={auth?.refresh_skew_seconds ? `${auth.refresh_skew_seconds}s` : "n/a"} />
            </div>
          </section>
        </div>

        {/* Metrics scan */}
        <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Activity size={14} /> Metrics scan
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Walks OpenMetadata and computes hard coverage numbers.
              </p>
            </div>
            <button
              onClick={onScan}
              disabled={busy === "scan"}
              className="px-3 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-xs text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40 transition"
            >
              {busy === "scan" ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />} Run scan
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <CoverageCard
              icon={<ShieldCheck size={14} />}
              title="PII coverage"
              pct={piiCov}
              hint={
                scan?.pii?.columns_likely_pii_missing_tag !== undefined
                  ? `${scan.pii.columns_likely_pii_missing_tag} columns need tagging`
                  : undefined
              }
            />
            <CoverageCard
              icon={<FileText size={14} />}
              title="Contract coverage"
              pct={contractCov}
              hint={
                scan?.contracts?.tables_with_contracts !== undefined
                  ? `${scan.contracts.tables_with_contracts} tables with contracts`
                  : undefined
              }
            />
            <CoverageCard
              icon={<CheckCircle2 size={14} />}
              title="DQ pass rate"
              pct={dqRate}
              hint={
                scan?.data_quality?.failing !== undefined
                  ? `${scan.data_quality.failing} failing tests`
                  : undefined
              }
            />
            <CoverageCard
              icon={<Users size={14} />}
              title="Ownership"
              pct={ownCov}
              hint={
                scan?.ownership?.tables_with_owner !== undefined
                  ? `${scan.ownership.tables_with_owner} tables owned`
                  : undefined
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// ────────── Helpers ──────────

function buildPipelineGraph(
  running: boolean,
  state: StewardState | null,
  digest: StewardDigest | null,
): { nodes: Node[]; edges: Edge[] } {
  const active = running;
  const evCount = state?.events_seen ?? digest?.totals?.events ?? 0;
  const actCount = state?.actions_taken ?? digest?.actions_taken ?? 0;

  type Tone = "source" | "process" | "action" | "sink";
  const palette: Record<Tone, { bg: string; border: string; text: string }> = {
    source: { bg: "#0c2a3f", border: "#38bdf8", text: "#bae6fd" },
    process: { bg: "#1e1b4b", border: "#818cf8", text: "#c7d2fe" },
    action: { bg: "#3f0f42", border: "#e879f9", text: "#f5d0fe" },
    sink: { bg: "#14532d", border: "#22c55e", text: "#bbf7d0" },
  };

  const makeNode = (
    id: string,
    kind: string,
    title: string,
    x: number,
    y: number,
    tone: Tone,
  ): Node => {
    const p = palette[tone];
    return {
      id,
      position: { x, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div className="text-left leading-tight">
            <div className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">
              {kind}
            </div>
            <div className="text-[12px] font-semibold truncate mt-0.5">{title}</div>
          </div>
        ),
      },
      style: {
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
        padding: 10,
        width: 170,
        color: p.text,
        fontSize: 12,
        boxShadow: active ? `0 0 0 1px ${p.border}33` : "none",
      },
      type: "default",
    } as Node;
  };

  const nodes: Node[] = [
    makeNode("om", "SOURCE", "OpenMetadata", 0, 90, "source"),
    makeNode("events", "STREAM", `Events · ${evCount}`, 230, 20, "process"),
    makeNode("classify", "CLASSIFY", "PII / DQ / Lineage", 230, 160, "process"),
    makeNode("actions", "ACTIONS", `Taken · ${actCount}`, 460, 90, "action"),
    makeNode("slack", "NOTIFY", "Slack", 700, 20, "sink"),
    makeNode("jira", "TICKET", "Jira / GitHub", 700, 160, "sink"),
  ];

  const strokeColor = active ? "#38bdf8" : "#52525b";
  const edgeStyle = {
    stroke: strokeColor,
    strokeWidth: 1.5,
    strokeDasharray: active ? "5 5" : undefined,
  };
  const marker = { type: MarkerType.ArrowClosed, color: strokeColor };
  const edges: Edge[] = [
    { id: "e1", source: "om", target: "events", animated: active, style: edgeStyle, markerEnd: marker },
    { id: "e2", source: "om", target: "classify", animated: active, style: edgeStyle, markerEnd: marker },
    { id: "e3", source: "events", target: "actions", animated: active, style: edgeStyle, markerEnd: marker },
    { id: "e4", source: "classify", target: "actions", animated: active, style: edgeStyle, markerEnd: marker },
    { id: "e5", source: "actions", target: "slack", animated: active, style: edgeStyle, markerEnd: marker },
    { id: "e6", source: "actions", target: "jira", animated: active, style: edgeStyle, markerEnd: marker },
  ];
  return { nodes, edges };
}

function KpiCard({ icon, label, value, tone }: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "ok" | "warn" | "bad" | "muted";
}>) {
  const color = {
    ok: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    bad: "text-red-300 bg-red-500/10 border-red-500/20",
    muted: "text-zinc-300 bg-white/[0.03] border-white/[0.06]",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-80 font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold mt-2 truncate">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="bg-surface-1/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
      <div className="text-sm font-bold text-zinc-100 mt-1 truncate">{value}</div>
    </div>
  );
}

function Chip({ label, value, tone }: Readonly<{
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "muted";
}>) {
  const color = {
    ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    bad: "bg-red-500/10 text-red-300 border-red-500/20",
    muted: "bg-white/[0.03] text-zinc-300 border-white/[0.06]",
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 ${color}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
      <div className="text-base font-bold mt-0.5">{value}</div>
    </div>
  );
}

function Row({ label, value, accent }: Readonly<{
  label: string;
  value: string | number;
  accent?: "ok" | "bad";
}>) {
  let color = "text-zinc-200";
  if (accent === "ok") color = "text-emerald-300";
  else if (accent === "bad") color = "text-red-300";
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-mono font-semibold ${color} truncate max-w-[60%]`}>{value}</span>
    </div>
  );
}

function CoverageCard({ icon, title, pct, hint }: Readonly<{
  icon: React.ReactNode;
  title: string;
  pct: number | null;
  hint?: string;
}>) {
  const val = pct ?? 0;
  let bar = "bg-zinc-500";
  if (pct !== null) {
    if (val >= 90) bar = "bg-emerald-500";
    else if (val >= 75) bar = "bg-brand-500";
    else if (val >= 50) bar = "bg-amber-500";
    else bar = "bg-red-500";
  }
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
        {icon}
        {title}
      </div>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span className="text-2xl font-bold text-zinc-100">
          {pct !== null ? val.toFixed(val < 100 ? 1 : 0) : "—"}
        </span>
        {pct !== null && <span className="text-sm text-zinc-500 font-semibold">%</span>}
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full mt-3 overflow-hidden">
        <div
          className={`h-full ${bar} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
        />
      </div>
      {hint && <p className="text-[10px] text-zinc-600 mt-2 truncate">{hint}</p>}
    </div>
  );
}

function DigestList({ title, items, empty }: Readonly<{
  title: string;
  items: Array<Record<string, unknown>>;
  empty: string;
}>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
          {title}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.06] bg-white/[0.01] p-6 text-center">
          <AlertCircle size={16} className="text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-600 italic">{empty}</p>
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {items.slice(0, 30).map((it, i) => {
            const actionVal = it.action;
            const actionStr =
              typeof actionVal === "string"
                ? actionVal
                : actionVal && typeof actionVal === "object"
                  ? ((actionVal as { kind?: string }).kind ?? JSON.stringify(actionVal))
                  : "";
            const summary =
              (it.title as string) ||
              (it.summary as string) ||
              (it.kind as string) ||
              actionStr ||
              JSON.stringify(it);
            const ts = (it.ts as string) || "";
            return (
              <li
                key={`${ts}-${i}`}
                className="flex items-start gap-2 text-[11px] font-mono leading-snug px-2 py-1.5 rounded-md hover:bg-white/[0.02] transition"
              >
                <span className="text-zinc-600 shrink-0">
                  {ts ? new Date(ts).toLocaleTimeString() : "—"}
                </span>
                <span className="text-zinc-300 truncate">{summary}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}