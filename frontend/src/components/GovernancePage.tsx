import { useState } from "react";
import { Activity, ArrowRight, Loader2, Send, ShieldCheck, AlertTriangle, CheckCircle2, FileDown } from "lucide-react";
import {
  fetchSchemaDrift,
  writeHealthScore,
  fetchConnectorExport,
  type SchemaDriftTimeline,
  type HealthScoreResult,
} from "../lib/api";

const KIND_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  table_created:      { bg: "bg-emerald-500/10", text: "text-emerald-300", label: "Table created" },
  column_added:       { bg: "bg-emerald-500/10", text: "text-emerald-300", label: "Column added" },
  column_dropped:     { bg: "bg-red-500/10",     text: "text-red-300",     label: "Column dropped" },
  column_renamed:     { bg: "bg-amber-500/10",   text: "text-amber-300",   label: "Column renamed" },
  column_type_changed:{ bg: "bg-amber-500/10",   text: "text-amber-300",   label: "Type changed" },
};

export default function GovernancePage() {
  const [fqn, setFqn] = useState("demo.warehouse.crm.customers");
  const [drift, setDrift] = useState<SchemaDriftTimeline | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [driftErr, setDriftErr] = useState<string | null>(null);

  const [score, setScore] = useState(87);
  const [pii, setPii] = useState(0.85);
  const [dq, setDq] = useState(0.92);
  const [coverage, setCoverage] = useState(0.78);
  const [healthRes, setHealthRes] = useState<HealthScoreResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);

  const loadDrift = async () => {
    setDriftLoading(true);
    setDriftErr(null);
    try {
      setDrift(await fetchSchemaDrift(fqn));
    } catch (e) {
      setDriftErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDriftLoading(false);
    }
  };

  const submitHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await writeHealthScore(fqn, score, { pii, dq, coverage });
      setHealthRes(res);
    } catch (e) {
      setHealthRes({
        ok: false, entity_fqn: fqn, property: "metaflow_health_score",
        score, breakdown: {}, written_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const downloadExport = async () => {
    setExportLoading(true);
    try {
      const data = await fetchConnectorExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metaflow-connector-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 space-y-8">
      <header className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <ShieldCheck size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Governance</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Schema drift timeline · health-score writebacks · OM connector export.
          </p>
        </div>
      </header>

      {/* Entity selector */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <label htmlFor="gov-fqn" className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
          Entity FQN
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="gov-fqn"
            value={fqn}
            onChange={(e) => setFqn(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/[0.06] text-sm text-zinc-200 font-mono focus:border-brand-500/50 outline-none"
            placeholder="service.database.schema.table"
          />
          <button
            onClick={loadDrift}
            disabled={!fqn || driftLoading}
            className="px-4 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-sm text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
          >
            {driftLoading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            Load drift
          </button>
        </div>
      </section>

      {/* Drift timeline */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Schema Drift Timeline</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Walks OM /tables/{"{id}"}/versions and diffs adjacent versions.</p>
          </div>
          {drift?.summary && (
            <div className="flex gap-2 text-[11px]">
              <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300">+{drift.summary.additions}</span>
              <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300">~{drift.summary.type_changes}</span>
              <span className="px-2 py-1 rounded bg-red-500/10 text-red-300">-{drift.summary.drops}</span>
            </div>
          )}
        </div>

        {driftErr && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={14} /> {driftErr}
          </div>
        )}

        {!drift && !driftLoading && !driftErr && (
          <p className="text-xs text-zinc-600 italic">Click "Load drift" above to fetch the version history.</p>
        )}

        {drift?.changes && drift.changes.length > 0 && (
          <ol className="space-y-3">
            {drift.changes.map((c, i) => {
              const style = KIND_STYLES[c.kind] || { bg: "bg-zinc-500/10", text: "text-zinc-300", label: c.kind };
              return (
                <li key={`${c.ts}-${i}`} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full ${style.bg} border border-white/10 flex items-center justify-center text-[10px] font-bold ${style.text}`}>
                      v{c.version}
                    </div>
                    {i < drift.changes.length - 1 && <div className="w-px flex-1 bg-white/[0.06] my-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase font-semibold tracking-wide ${style.text}`}>{style.label}</span>
                      <span className="text-[11px] text-zinc-600">{new Date(c.ts).toLocaleString()}</span>
                      <span className="text-[11px] text-zinc-600">· {c.by}</span>
                    </div>
                    <p className="text-sm text-zinc-200 mt-1 font-mono">{c.column}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{c.details}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {drift && drift.changes.length === 0 && (
          <p className="text-xs text-zinc-500 italic">No version history yet for this table.</p>
        )}
      </section>

      {/* Health score writeback */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-zinc-200">Write Health Score Back to OM</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            PATCHes <code className="text-brand-400">metaflow_health_score</code> custom property on the table.
            Visible in OM UI under Custom Properties.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <NumField label="Score (0-100)" value={score} onChange={setScore} step={1} />
          <NumField label="PII (0-1)" value={pii} onChange={setPii} step={0.05} />
          <NumField label="DQ (0-1)" value={dq} onChange={setDq} step={0.05} />
          <NumField label="Coverage (0-1)" value={coverage} onChange={setCoverage} step={0.05} />
        </div>

        <button
          onClick={submitHealth}
          disabled={healthLoading || !fqn}
          className="mt-4 px-4 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-sm text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
        >
          {healthLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          PATCH to OpenMetadata
        </button>

        {healthRes && (
          <div className={`mt-4 rounded-lg p-3 text-xs flex items-start gap-2 border ${
            healthRes.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
              : "bg-red-500/10 border-red-500/30 text-red-200"
          }`}>
            {healthRes.ok ? <CheckCircle2 size={14} className="mt-0.5" /> : <AlertTriangle size={14} className="mt-0.5" />}
            <div className="flex-1">
              <p className="font-semibold">
                {healthRes.ok ? "Score written" : "Failed"} · score={healthRes.score} · {healthRes.entity_fqn}
              </p>
              {healthRes.note && <p className="opacity-70 mt-1">{healthRes.note}</p>}
              {healthRes.error && <p className="opacity-70 mt-1">{healthRes.error}</p>}
              {healthRes.om_url && (
                <a href={healthRes.om_url} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-brand-300 hover:underline mt-2">
                  Open in OM <ArrowRight size={12} />
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Connector export */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Virtual OM Connector — Export</h2>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
              Frames MetaFlow's outputs (health scores, contract status, drift events, steward actions)
              as if they were a custom OM ingestion source. Downstream pipelines can ingest this JSON.
            </p>
          </div>
          <button
            onClick={downloadExport}
            disabled={exportLoading}
            className="px-4 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-sm text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
          >
            {exportLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Download JSON
          </button>
        </div>
      </section>
    </div>
  );
}

function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="px-3 py-2 rounded-lg bg-surface border border-white/[0.06] text-sm text-zinc-200 focus:border-brand-500/50 outline-none"
      />
    </label>
  );
}
