import { useEffect, useState } from "react";
import { Activity, Loader2, Play, RefreshCw, Square, Bot, AlertCircle, KeyRound } from "lucide-react";
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
    const t = setInterval(refreshAll, 15000);
    return () => clearInterval(t);
  }, []);

  const onStart = async () => { setBusy("start"); try { setState(await startSteward()); } finally { setBusy(null); } };
  const onStop  = async () => { setBusy("stop");  try { setState(await stopSteward());  } finally { setBusy(null); } };
  const onRefreshAuth = async () => {
    setBusy("auth");
    try { setAuth(await refreshAuthToken()); } finally { setBusy(null); }
  };
  const onScan = async () => {
    setBusy("scan");
    try { setScan(await fetchMetricsScan(100)); } finally { setBusy(null); }
  };

  const running = state?.running ?? false;

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6">
      <header className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <Bot size={20} className="text-brand-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white tracking-tight">Operations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Continuous Data Steward · Auth & token status · Real-data metrics scan.
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-300 flex items-center gap-2"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {/* ───── Steward ───── */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              Continuous Data Steward
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                running ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"
              }`}>
                {running ? "RUNNING" : "STOPPED"}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Background loop that watches OM events and auto-tags PII / files Jira tickets / posts to Slack.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onStart}
              disabled={running || busy === "start"}
              className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-300 font-medium flex items-center gap-2 disabled:opacity-40"
            >
              {busy === "start" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start
            </button>
            <button
              onClick={onStop}
              disabled={!running || busy === "stop"}
              className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs text-red-300 font-medium flex items-center gap-2 disabled:opacity-40"
            >
              {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Stop
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Loop runs" value={state?.loop_count ?? "—"} />
          <Stat label="Events seen" value={state?.events_seen ?? "—"} />
          <Stat label="Actions taken" value={state?.actions_taken ?? "—"} />
          <Stat label="Interval" value={state?.interval_seconds ? `${state.interval_seconds}s` : "—"} />
        </div>

        {digest && (digest.events.length > 0 || digest.actions.length > 0) && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <DigestList title="Recent events" items={digest.events} />
            <DigestList title="Actions taken" items={digest.actions} />
          </div>
        )}
      </section>

      {/* ───── Auth status ───── */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <KeyRound size={14} /> OpenMetadata Auth
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Active credential mode and OAuth token lifetime (if applicable).
            </p>
          </div>
          {auth?.mode === "oauth_client_credentials" && (
            <button
              onClick={onRefreshAuth}
              disabled={busy === "auth"}
              className="px-3 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-xs text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
            >
              {busy === "auth" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Force refresh
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Mode" value={auth?.mode ?? "—"} />
          <Stat label="Token present" value={auth?.token_present ? "yes" : "no"} accent={auth?.token_present ? "ok" : "warn"} />
          <Stat label="Expires in" value={auth?.expires_in ? `${auth.expires_in}s` : "—"} />
          <Stat label="Refresh skew" value={auth?.refresh_skew_seconds ? `${auth.refresh_skew_seconds}s` : "—"} />
        </div>
      </section>

      {/* ───── Metrics scan ───── */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Activity size={14} /> Metrics Scan
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Walks OM and computes hard numbers: PII coverage, contract coverage, DQ pass rate, ownership coverage.
            </p>
          </div>
          <button
            onClick={onScan}
            disabled={busy === "scan"}
            className="px-3 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-xs text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
          >
            {busy === "scan" ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />} Run scan
          </button>
        </div>

        {!scan && <p className="text-xs text-zinc-600 italic">Click "Run scan" to compute live metrics from OM.</p>}
        {scan && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Tables scanned" value={scan.total_tables_scanned ?? "—"} />
            <Stat label="PII coverage" value={scan.pii ? `${scan.pii.coverage_pct}%` : "—"} />
            <Stat label="Contract coverage" value={scan.contracts ? `${scan.contracts.coverage_pct}%` : "—"} />
            <Stat label="DQ pass rate" value={scan.dq ? `${scan.dq.pass_rate_pct}%` : "—"} />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "ok" | "warn" }) {
  const color = accent === "ok" ? "text-emerald-300" : accent === "warn" ? "text-amber-300" : "text-zinc-100";
  return (
    <div className="rounded-lg bg-surface border border-white/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</p>
      <p className={`text-base font-bold ${color} mt-1 truncate`}>{value}</p>
    </div>
  );
}

function DigestList({ title, items }: { title: string; items: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded-lg bg-surface border border-white/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600 italic flex items-center gap-1.5">
          <AlertCircle size={11} /> Nothing yet today.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {items.slice(0, 20).map((it, i) => {
            const summary = (it.summary as string) || (it.kind as string) || (it.action as string) || JSON.stringify(it);
            const ts = (it.ts as string) || "";
            return (
              <li key={`${ts}-${i}`} className="text-[11px] text-zinc-400 font-mono leading-snug">
                <span className="text-zinc-600">{ts ? new Date(ts).toLocaleTimeString() : ""}</span>{" "}
                <span className="text-zinc-300">{summary}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
