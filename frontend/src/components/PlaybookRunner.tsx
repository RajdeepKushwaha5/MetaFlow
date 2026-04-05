import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Play, ArrowLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { PlaybookInfo } from "../lib/types";
import { streamPlaybook } from "../lib/api";

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

  const handleRun = async () => {
    const text = input.trim();
    if (!text || running) return;

    setRunning(true);
    setSteps([]);

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
            i === event.step ? { ...s, content: event.content as string } : s
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
    });

    setRunning(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-white flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-2xl">{playbook.icon}</span>
        <div>
          <h2 className="font-semibold text-gray-900">{playbook.name}</h2>
          <p className="text-xs text-gray-500">{playbook.description}</p>
        </div>
      </div>

      {/* Input + run button */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          {playbook.input_label}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={playbook.input_placeholder}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={running}
          />
          <button
            onClick={handleRun}
            disabled={running || !input.trim()}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-white text-sm font-medium
                       hover:bg-brand-700 disabled:opacity-40 transition flex items-center gap-2"
          >
            <Play size={16} />
            Run
          </button>
        </div>
      </div>

      {/* Step results timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-3">
            {/* Status icon */}
            <div className="mt-1">
              {step.status === "running" && (
                <Loader2 size={18} className="text-brand-500 animate-spin" />
              )}
              {step.status === "done" && (
                <CheckCircle2 size={18} className="text-green-500" />
              )}
              {step.status === "error" && (
                <AlertCircle size={18} className="text-red-500" />
              )}
              {step.status === "pending" && (
                <div className="w-4.5 h-4.5 rounded-full border-2 border-gray-300" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Step {idx + 1}: {step.description}
              </p>
              {step.content && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="markdown-content prose prose-sm max-w-none">
                    <ReactMarkdown>{step.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {steps.length === 0 && !running && (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-sm">Enter a description above and hit Run.</p>
          </div>
        )}
      </div>
    </div>
  );
}
