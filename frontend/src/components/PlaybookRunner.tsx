import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Play,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCcw,
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
  Sparkles,
  BarChart3,
  Square,
  PartyPopper,
} from "lucide-react";
import type { PlaybookInfo } from "../lib/types";
import { streamPlaybook } from "../lib/api";

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
};

interface StepResult {
  description: string;
  status: "pending" | "running" | "done" | "error";
  content?: string;
}

interface Props {
  playbook: PlaybookInfo;
  onBack: () => void;
}

export default function PlaybookRunner({ playbook, onBack }: Props) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const doneCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = playbook.step_count;
  const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

  const Icon = ICON_MAP[playbook.id] || Workflow;

  useEffect(() => {
    const ctrl = abortRef.current;
    return () => { ctrl?.abort(); };
  }, []);

  const handleRun = async () => {
    const text = input.trim();
    if (!text || running) return;

    setRunning(true);
    setSteps([]);
    setRunError(null);
    setCompleted(false);

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      await streamPlaybook(playbook.id, text, (event) => {
      if (event.type === "step_start") {
        setSteps((prev) => [
          ...prev,
          {
            description: (event.description as string) || `Step ${event.step}`,
            status: "running",
          },
        ]);
      }
      if (event.type === "chunk" && typeof event.step === "number") {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === event.step ? { ...s, content: (s.content || "") + (event.content as string) } : s
          )
        );
      }
      if (event.type === "step_done" && typeof event.step === "number") {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === event.step ? { ...s, status: "done" } : s
          )
        );
      }
      if (event.type === "error") {
        setSteps((prev) => {
          const updated = [...prev];
          const last = updated.length - 1;
          if (last >= 0) {
            updated[last] = {
              ...updated[last],
              status: "error",
              content: event.message as string,
            };
          }
          return updated;
        });
      }
    }, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // cancelled
      } else {
        const errMsg = err instanceof Error ? err.message : "Network request failed";
        setRunError(errMsg);
      }
    }
    abortRef.current = null;

    // Check if all steps completed without errors
    setSteps((prev) => {
      const allDone = prev.length > 0 && prev.every((s) => s.status === "done");
      if (allDone) setCompleted(true);
      return prev;
    });
    setRunning(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/[0.04] px-6 py-5 bg-surface-1/60 backdrop-blur-xl flex items-center gap-4 animate-fade-up relative">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center glass text-zinc-500 hover:text-brand-400 hover:bg-white/[0.04] transition-all duration-300"
          aria-label="Back to playbooks"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-700/10 border border-brand-500/[0.15] flex items-center justify-center glow-green-sm">
          <Icon size={18} className="text-brand-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white truncate font-display">{playbook.name}</h2>
          <p className="text-xs text-zinc-500 truncate">{playbook.description}</p>
        </div>
      </div>

      {/* Input */}
      <div className="px-6 py-5 bg-surface-1/40 backdrop-blur-lg border-b border-white/[0.04] animate-fade-up delay-1">
        <label className="text-[11px] font-semibold text-zinc-400 mb-2 block uppercase tracking-wider">
          {playbook.input_label}
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={playbook.input_placeholder}
            className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[15px] text-zinc-100
                       placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/25 focus:bg-white/[0.035] transition-all duration-300"
            disabled={running}
            onKeyDown={(e) => e.key === "Enter" && handleRun()}
          />
          {running ? (
            <button
              onClick={handleCancel}
              className="rounded-2xl bg-red-500/15 border border-red-500/20 px-6 py-3 text-red-400 text-sm font-semibold
                         hover:bg-red-500/25 transition-all duration-300 flex items-center gap-2"
            >
              <Square size={13} />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!input.trim()}
              className="rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-white text-sm font-semibold
                         hover:from-brand-400 hover:to-brand-500 disabled:opacity-30 transition-all duration-300 flex items-center gap-2 shadow-glow"
            >
              <Play size={15} />
              Run
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(running || completed) && steps.length > 0 && (
          <div className="mt-4 animate-fade-up">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500 font-medium">
                {completed ? "Completed" : `Step ${doneCount + (running ? 1 : 0)} of ${totalSteps}`}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">{completed ? 100 : progressPct}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  completed
                    ? "bg-gradient-to-r from-brand-500 to-brand-400"
                    : "bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400"
                }`}
                style={{ width: `${completed ? 100 : progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto bg-radial-subtle">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${idx * 0.1}s` }}>
              <div className="mt-1 shrink-0">
                {step.status === "running" && (
                  <Loader2 size={16} className="text-brand-400 animate-spin" />
                )}
                {step.status === "done" && (
                  <CheckCircle2 size={16} className="text-brand-400" />
                )}
                {step.status === "error" && (
                  <AlertCircle size={16} className="text-red-400" />
                )}
                {step.status === "pending" && (
                  <div className="w-4 h-4 rounded-full border border-white/[0.1]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-200">
                  Step {idx + 1}: {step.description}
                </p>
                {step.content && (
                  <div className="mt-2.5 rounded-2xl glass p-5">
                    <div className="markdown-content prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{step.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {steps.length === 0 && !running && !runError && !completed && (
            <div className="text-center text-zinc-600 mt-16">
              <p className="text-sm">Provide input above, then press Run to start the playbook.</p>
            </div>
          )}

          {/* Success state */}
          {completed && (
            <div className="mt-6 flex flex-col items-center gap-3 animate-fade-up">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
                <PartyPopper size={22} className="text-brand-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-200">Playbook completed successfully</p>
              <p className="text-xs text-zinc-500">{steps.length} steps executed</p>
            </div>
          )}

          {runError && (
            <div className="flex flex-col items-center gap-3 mt-8 animate-fade-up">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                <span>{runError}</span>
              </div>
              <button
                onClick={handleRun}
                disabled={running || !input.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/[0.04] text-zinc-400 hover:text-brand-400 text-sm transition-all duration-300 disabled:opacity-40"
              >
                <RotateCcw size={14} /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
