import { useEffect, useState } from "react";
import {
  Target,
  Lock,
  AlertTriangle,
  Stethoscope,
  FileBarChart,
  ShieldCheck,
  Sheet,
  FileText,
  TicketCheck,
  GitBranch,
  Workflow,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  BarChart3,
  Search,
  X,
} from "lucide-react";
import type { PlaybookInfo } from "../lib/types";
import { fetchPlaybooks } from "../lib/api";

// Map playbook IDs to icons (no emojis)
const ICON_MAP: Record<string, typeof Target> = {
  "impact-radar": Target,
  "pii-sweep": Lock,
  "dq-fire-drill": AlertTriangle,
  "metadata-health": Stethoscope,
  "dq-report-notify": FileBarChart,
  "pii-track-notify": ShieldCheck,
  "dq-sheet-alert": Sheet,
  "metadata-audit-doc": FileText,
  "dq-jira-email": TicketCheck,
  "lineage-notion-jira": GitBranch,
  "full-incident-response": Workflow,
  "dq-test-recommender": Sparkles,
  "platform-health-kpi": BarChart3,
  "contract-copilot": ShieldCheck,
  "bulk-lineage-from-query-logs": GitBranch,
};

// Categorize playbooks
function categorize(playbooks: PlaybookInfo[]) {
  const core: PlaybookInfo[] = [];
  const cross: PlaybookInfo[] = [];
  const ai: PlaybookInfo[] = [];
  for (const pb of playbooks) {
    if (["impact-radar", "pii-sweep", "dq-fire-drill", "metadata-health"].includes(pb.id)) {
      core.push(pb);
    } else if (["dq-test-recommender", "platform-health-kpi"].includes(pb.id)) {
      ai.push(pb);
    } else {
      cross.push(pb);
    }
  }
  return { core, cross, ai };
}

interface Props {
  onSelect: (playbook: PlaybookInfo) => void;
}

export default function PlaybookGallery({ onSelect }: Props) {
  const [playbooks, setPlaybooks] = useState<PlaybookInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlaybooks();
      setPlaybooks(data);
    } catch {
      setError("Could not load playbooks. Is the backend running?");
      setPlaybooks([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = search.trim()
    ? playbooks.filter((pb) => {
        const q = search.toLowerCase();
        return pb.name.toLowerCase().includes(q) || pb.description.toLowerCase().includes(q) || pb.id.toLowerCase().includes(q);
      })
    : playbooks;
  const { core, cross, ai } = categorize(filtered);

  const renderCard = (pb: PlaybookInfo, idx: number) => {
    const Icon = ICON_MAP[pb.id] || Workflow;
    return (
      <button
        key={pb.id}
        onClick={() => onSelect(pb)}
        className={`text-left rounded-2xl glass p-5
                   transition-all duration-300 group card-interactive
                   flex items-start gap-4 animate-fade-up delay-${Math.min(idx + 1, 6)}`}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/[0.08] to-brand-700/[0.04] border border-brand-500/[0.12] group-hover:from-brand-500/15 group-hover:to-brand-600/10 group-hover:border-brand-500/20 flex items-center justify-center shrink-0 transition-all duration-300">
          <Icon size={18} className="text-zinc-500 group-hover:text-brand-400 transition-colors duration-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-zinc-200 group-hover:text-white truncate transition-colors duration-300">
              {pb.name}
            </h3>
            <ChevronRight size={14} className="text-zinc-700 group-hover:text-brand-400 shrink-0 ml-2 transition-all duration-300 group-hover:translate-x-0.5" />
          </div>
          <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{pb.description}</p>
          <div className="flex items-center gap-2 mt-2.5">
            <div className="w-1 h-1 rounded-full bg-brand-500/30" />
            <p className="text-[11px] text-zinc-600 tracking-wide font-medium">{pb.step_count} steps</p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-radial-subtle">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="animate-fade-up">
          <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
            <span className="gradient-text-subtle">Playbooks</span>
          </h2>
          <p className="text-[15px] text-zinc-500 mt-2 leading-relaxed">
            Pre-built multi-step workflows that chain agents across platforms.
          </p>
        </div>

        {/* Search bar */}
        {!loading && !error && playbooks.length > 0 && (
          <div className="relative animate-fade-up delay-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playbooks..."
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-11 pr-10 py-3 text-sm text-zinc-200
                         placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/25 focus:bg-white/[0.035] transition-all duration-300"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <Loader2 size={28} className="text-brand-500/40 animate-spin mb-3" />
            <p className="text-sm text-zinc-600">Loading playbooks...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <AlertCircle size={32} className="text-red-400/60 mb-3" />
            <p className="text-sm text-zinc-400 mb-4">{error}</p>
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/[0.04] text-zinc-400 hover:text-brand-400 text-sm transition-all duration-300"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-zinc-600 mt-16 animate-fade-in">
            {search ? (
              <>
                <Search size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-zinc-500">No playbooks match "{search}"</p>
                <button onClick={() => setSearch("")} className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors">Clear search</button>
              </>
            ) : (
              <p className="text-sm">No playbooks available.</p>
            )}
          </div>
        ) : (
          <>
            {/* Core workflows */}
            {core.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold text-brand-500/60 uppercase tracking-[0.18em] mb-4 animate-fade-up">
                  Core Metadata Operations
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {core.map((pb, i) => renderCard(pb, i))}
                </div>
              </section>
            )}

            {/* Cross-platform */}
            {cross.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold text-brand-500/60 uppercase tracking-[0.18em] mb-4 animate-fade-up">
                  Cross-Platform Workflows
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cross.map((pb, i) => renderCard(pb, i + core.length))}
                </div>
              </section>
            )}

            {/* AI-Powered */}
            {ai.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold text-brand-500/60 uppercase tracking-[0.18em] mb-4 animate-fade-up">
                  AI-Powered Analytics
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ai.map((pb, i) => renderCard(pb, i + core.length + cross.length))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
