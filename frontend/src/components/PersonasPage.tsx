import { useEffect, useState } from "react";
import { Bot, Cpu, Loader2, MessageSquare, Send, Sparkles, Upload, Users } from "lucide-react";
import {
  fetchPersonas,
  publishPersonas,
  invokePersona,
  type PersonaInfo,
  type PersonasPublishResult,
} from "../lib/api";
import MiniFlow, { type FlowNodeSpec, type FlowEdgeSpec } from "./MiniFlow";

const PERSONA_FLOW_NODES: FlowNodeSpec[] = [
  { id: "specialist", tone: "data", label: "MetaFlow Specialist", sublabel: "LangGraph agent", icon: Bot, col: 0 },
  { id: "publish", tone: "process", label: "Publish", sublabel: "POST /personas", icon: Upload, col: 1 },
  { id: "om", tone: "agent", label: "OM AI Studio", sublabel: "persona runtime", icon: Cpu, col: 2 },
  { id: "user", tone: "input", label: "User Prompt", sublabel: "natural language", icon: MessageSquare, col: 3 },
  { id: "reply", tone: "output", label: "Grounded Reply", sublabel: "tool-calling enabled", icon: Sparkles, col: 4 },
];

const PERSONA_FLOW_EDGES: FlowEdgeSpec[] = [
  { from: "specialist", to: "publish" },
  { from: "publish", to: "om", label: "persona spec" },
  { from: "user", to: "om", label: "invoke" },
  { from: "om", to: "reply" },
];

export default function PersonasPage() {
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [backend, setBackend] = useState("local");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishRes, setPublishRes] = useState<PersonasPublishResult | null>(null);

  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchPersonas();
      setPersonas(r.personas);
      setBackend(r.backend);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onPublish = async () => {
    setPublishing(true);
    try {
      const r = await publishPersonas();
      setPublishRes(r);
      await load();
    } finally {
      setPublishing(false);
    }
  };

  const onInvoke = async () => {
    if (!active || !message.trim()) return;
    setInvoking(true);
    setReply(null);
    try {
      const r = await invokePersona(active, message);
      const text = (r.reply ?? r.response ?? r.content ?? JSON.stringify(r, null, 2)) as string;
      setReply(typeof text === "string" ? text : JSON.stringify(text, null, 2));
    } catch (e) {
      setReply(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInvoking(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Users size={20} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">AI Studio Personas</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Publish each MetaFlow specialist as a native OM AI Studio persona. Backend:{" "}
              <span className={backend === "ai_sdk" || backend === "openmetadata_rest" ? "text-emerald-400" : "text-amber-400"}>{backend}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onPublish}
          disabled={publishing}
          className="px-4 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-sm text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40 shrink-0"
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Publish all
        </button>
      </header>

      {publishRes && (
        <div className="rounded-lg p-3 text-xs bg-brand-500/[0.06] border border-brand-500/20 text-zinc-300 flex items-center gap-3">
          <Sparkles size={14} className="text-brand-400" />
          Published <b className="text-emerald-300">{publishRes.created.length}</b> created ·{" "}
          <b className="text-amber-300">{publishRes.updated.length}</b> updated ·{" "}
          <b className="text-red-300">{publishRes.failed.length}</b> failed (of {publishRes.total}) — backend={publishRes.backend}
        </div>
      )}

      {/* Pipeline flow */}
      <section className="rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-zinc-200">Persona Pipeline</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Specialists are published to OM AI Studio, then invoked from the UI.</p>
        </div>
        <MiniFlow nodes={PERSONA_FLOW_NODES} edges={PERSONA_FLOW_EDGES} height={200} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Persona list */}
        <section className="lg:col-span-1 rounded-2xl border border-white/[0.06] bg-surface-1/40 p-4 max-h-[70vh] overflow-y-auto">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">Personas ({personas.length})</h2>
          {loading && <Loader2 size={14} className="animate-spin text-zinc-500" />}
          {!loading && personas.length === 0 && (
            <p className="text-xs text-zinc-600 italic">No personas yet — click "Publish all" above.</p>
          )}
          <ul className="space-y-1.5">
            {personas.map((p) => (
              <li key={p.name}>
                <button
                  onClick={() => { setActive(p.name); setReply(null); }}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition border ${
                    active === p.name
                      ? "bg-brand-500/15 border-brand-500/30"
                      : "border-transparent hover:bg-white/[0.03] hover:border-white/[0.06]"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-200">{p.display_name || p.name}</p>
                  {p.description && <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{p.description}</p>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Invoke panel */}
        <section className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-surface-1/40 p-5">
          {!active ? (
            <p className="text-sm text-zinc-500 italic">Pick a persona on the left to send it a message.</p>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-zinc-200 mb-1">
                Invoke <span className="text-brand-400">{active}</span>
              </h2>
              <p className="text-xs text-zinc-500 mb-3">
                Routes to OM persona endpoint when supported, else runs the matching LangGraph specialist locally.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="e.g. Summarize governance status for sample_db_service.ecommerce_db.shopify.dim_customer in 3 bullets."
                className="w-full px-3 py-2 rounded-lg bg-surface border border-white/[0.06] text-sm text-zinc-200 focus:border-brand-500/50 outline-none resize-none"
              />
              <button
                onClick={onInvoke}
                disabled={!message.trim() || invoking}
                className="mt-3 px-4 py-2 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-sm text-brand-300 font-medium flex items-center gap-2 disabled:opacity-40"
              >
                {invoking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>

              {reply && (
                <div className="mt-4 rounded-lg bg-surface border border-white/[0.06] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Response</p>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words font-mono">{reply}</pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
