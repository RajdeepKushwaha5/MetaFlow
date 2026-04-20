import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Database, GitBranch, Shield, Search, Zap, Sparkles, Loader2, RotateCcw, Eraser, Bot, Wrench, Copy, Check } from "lucide-react";
import type { ChatMessage, AgentStep } from "../lib/types";
import { streamChat, fetchConversation } from "../lib/api";

const AGENT_LABELS: Record<string, string> = {
  discovery_agent: "Discovery",
  lineage_agent: "Lineage",
  curator_agent: "Curator",
  data_quality_agent: "Data Quality",
  governance_agent: "Governance",
  github_agent: "GitHub",
  slack_agent: "Slack",
  google_agent: "Google",
  email_agent: "Email",
  jira_agent: "Jira",
  notion_agent: "Notion",
  insights_agent: "Insights",
};

const SUGGESTIONS = [
  { icon: Search, label: "Find tables containing customer PII data" },
  { icon: GitBranch, label: "Trace lineage for the orders table" },
  { icon: Shield, label: "Run a PII compliance sweep on marketing tables" },
  { icon: Zap, label: "Diagnose the null rate spike on orders.amount" },
];

interface ChatPanelProps {
  resumeThreadId?: string | null;
  onThreadResumed?: () => void;
}

export default function ChatPanel({ resumeThreadId, onThreadResumed }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUserMsg, setLastUserMsg] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userScrolledUp = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Resume a conversation from History
  useEffect(() => {
    if (!resumeThreadId) return;
    fetchConversation(resumeThreadId)
      .then((conv) => {
        const loaded: ChatMessage[] = conv.messages.map((m, i) => ({
          id: `resumed-${i}`,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: Date.now(),
        }));
        setMessages(loaded);
        setThreadId(resumeThreadId);
        onThreadResumed?.();
      })
      .catch(() => {});
  }, [resumeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userScrolledUp.current) {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !atBottom;
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setLastUserMsg(msg);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    let assistantContent = "";
    const assistantId = crypto.randomUUID();
    const currentSteps: AgentStep[] = [];

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), agentSteps: [] },
    ]);

    try {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      await streamChat(msg, threadId, (event) => {
        if (event.type === "thread_id" && typeof event.thread_id === "string") {
          setThreadId(event.thread_id);
        }
        if (event.type === "agent_start" && typeof event.agent === "string") {
          // Mark previous step as done
          if (currentSteps.length > 0) {
            currentSteps[currentSteps.length - 1].status = "done";
          }
          currentSteps.push({ agent: event.agent, tools: [], status: "running" });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, agentSteps: [...currentSteps] } : m
            )
          );
        }
        if (event.type === "tool_call" && typeof event.tool === "string") {
          const last = currentSteps[currentSteps.length - 1];
          if (last) {
            last.tools = [...last.tools, event.tool];
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, agentSteps: [...currentSteps] } : m
            )
          );
        }
        if (event.type === "chunk" && typeof event.content === "string") {
          // Mark all steps as done when final content arrives
          for (let i = 0; i < currentSteps.length; i++) {
            currentSteps[i] = { ...currentSteps[i], status: "done" };
          }
          assistantContent += event.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: assistantContent, agentSteps: [...currentSteps] } : m
            )
          );
        }
        if (event.type === "error" && typeof event.message === "string") {
          assistantContent = `Error: ${event.message}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: assistantContent } : m
            )
          );
        }
      }, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — leave partial content
      } else {
        const errMsg = err instanceof Error ? err.message : "Network request failed";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Connection error: ${errMsg}` }
              : m
          )
        );
      }
    }
    abortRef.current = null;
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setThreadId(null);
    setLastUserMsg(null);
    setInput("");
    inputRef.current?.focus();
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 bg-radial-hero relative overflow-hidden">
            {/* Decorative orbs */}
            <div className="absolute top-32 left-1/3 w-64 h-64 bg-brand-500/[0.03] rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/3 w-48 h-48 bg-brand-700/[0.04] rounded-full blur-3xl" />

            <div className="max-w-xl w-full text-center relative z-10">
              {/* Hero */}
              <div className="mb-6 animate-fade-up">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/15 to-brand-700/10 border border-brand-500/[0.15] mb-7 glow-green animate-float">
                  <Database size={26} className="text-brand-400" />
                </div>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-4 font-display tracking-tight leading-tight">
                  <span className="gradient-text">What can I help</span><br />
                  <span className="gradient-text">you with?</span>
                </h2>
                <p className="text-[15px] text-zinc-500 leading-relaxed max-w-md mx-auto">
                  Orchestrating 12 agents across OpenMetadata, GitHub, Slack,
                  Google Workspace, Jira, Notion, and Email.
                </p>
              </div>

              {/* Suggestion cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-6 sm:mt-8">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.label)}
                    disabled={loading}
                    className={`flex items-start gap-3 text-left p-4 rounded-2xl glass
                               transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
                               text-zinc-400 group card-interactive animate-fade-up delay-${i + 2}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-500/[0.06] border border-brand-500/[0.08] flex items-center justify-center shrink-0 transition-all duration-300 group-hover:bg-brand-500/10 group-hover:border-brand-500/15">
                      <s.icon
                        size={14}
                        className="text-zinc-600 group-hover:text-brand-400 transition-colors duration-300"
                      />
                    </div>
                    <span className="text-[13px] group-hover:text-zinc-200 leading-relaxed transition-colors duration-300 mt-1">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
            {messages.map((msg, idx) => (
              <div key={msg.id} className="flex gap-3.5 animate-fade-up group/msg" style={{ animationDelay: `${idx * 0.03}s` }}>
                {/* Avatar */}
                <div
                  role="img"
                  aria-label={msg.role === "user" ? "User avatar" : "MetaFlow avatar"}
                  className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                    msg.role === "user"
                      ? "bg-white/[0.05] text-zinc-400 border border-white/[0.06]"
                      : "bg-gradient-to-br from-brand-500/15 to-brand-700/10 text-brand-400 border border-brand-500/[0.12]"
                  }`}
                >
                  {msg.role === "user" ? "U" : "M"}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-semibold mb-1.5 uppercase tracking-wider ${
                    msg.role === "user" ? "text-zinc-600" : "text-brand-500/60"
                  }`}>
                    {msg.role === "user" ? "You" : "MetaFlow"}
                  </p>
                  {msg.role === "assistant" ? (
                    <>
                      {/* Agent reasoning timeline */}
                      {msg.agentSteps && msg.agentSteps.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          {msg.agentSteps.map((step, si) => (
                            <div key={si} className="flex items-center gap-2 text-[11px] animate-fade-up">
                              {step.status === "running" ? (
                                <Loader2 size={10} className="animate-spin text-brand-400 shrink-0" />
                              ) : (
                                <Bot size={10} className="text-brand-500/60 shrink-0" />
                              )}
                              <span className={`font-semibold ${step.status === "running" ? "text-brand-400" : "text-zinc-500"}`}>
                                {AGENT_LABELS[step.agent] || step.agent}
                              </span>
                              {step.tools.length > 0 && (
                                <span className="flex items-center gap-1 text-zinc-600">
                                  <Wrench size={9} />
                                  {step.tools.map((t, ti) => (
                                    <span key={ti} className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.04] text-[10px] font-mono">
                                      {t}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.content ? (
                        <div className="markdown-content prose prose-sm prose-invert max-w-none text-zinc-300">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-zinc-500 text-sm">
                          <Loader2 size={14} className="animate-spin text-brand-400" />
                          <span>{msg.agentSteps && msg.agentSteps.length > 0 ? "Processing..." : "Thinking..."}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-200 leading-relaxed">{msg.content}</p>
                  )}
                  {/* Action buttons */}
                  {msg.role === "assistant" && msg.content && !msg.content.startsWith("Error:") && !msg.content.startsWith("Connection error:") && (
                    <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/[0.04] text-[11px] text-zinc-600 hover:text-zinc-300 transition-all duration-200"
                        title="Copy response"
                      >
                        {copiedId === msg.id ? <Check size={11} className="text-brand-400" /> : <Copy size={11} />}
                        {copiedId === msg.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                  {/* Retry button on error messages */}
                  {msg.role === "assistant" && (msg.content.startsWith("Error:") || msg.content.startsWith("Connection error:")) && !loading && (
                    <button
                      onClick={() => { if (lastUserMsg) handleSend(lastUserMsg); }}
                      className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg glass hover:bg-white/[0.04] text-xs text-zinc-400 hover:text-brand-400 transition-all duration-300"
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-white/[0.04] bg-surface-1/60 backdrop-blur-xl relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />
        <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.06]
                       bg-white/[0.025] focus-within:border-brand-500/25 focus-within:bg-white/[0.035]
                       focus-within:shadow-glow transition-all duration-400 px-4"
          >
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-brand-400 hover:bg-white/[0.04] transition-all duration-300 shrink-0"
                title="New chat"
                aria-label="Start new conversation"
              >
                <Eraser size={15} />
              </button>
            )}
            <Sparkles size={15} className="text-zinc-700 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? "Waiting for response..." : "Describe what you need..."}
              className="flex-1 bg-transparent py-3.5 text-[15px] text-zinc-100
                         placeholder:text-zinc-600 focus:outline-none"
              disabled={loading}
            />
            {loading ? (
              <div className="p-2.5 shrink-0">
                <Loader2 size={16} className="animate-spin text-brand-400" />
              </div>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 p-2.5 text-white
                           hover:from-brand-400 hover:to-brand-500 disabled:opacity-20 transition-all duration-300 shrink-0 shadow-glow"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </form>
          <p className="text-[11px] text-zinc-600 text-center mt-3 tracking-wide">
            MetaFlow chains agents automatically across multiple platforms.
          </p>
        </div>
      </div>
    </div>
  );
}
