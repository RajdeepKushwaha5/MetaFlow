import { useState, useEffect } from "react";
import {
  MessageSquare,
  BookOpen,
  Clock,
  BarChart3,
  Database,
  Home,
  Zap,
  Settings,
  Menu,
  X,
  ShieldCheck,
  Shield,
  Activity,
  Users,
  Bot,
} from "lucide-react";
import { GeminiLogo, OpenAILogo } from "./components/PlatformLogos";
import ChatPanel from "./components/ChatPanel";
import PlaybookGallery from "./components/PlaybookGallery";
import PlaybookRunner from "./components/PlaybookRunner";
import ConversationHistory from "./components/ConversationHistory";
import AgentDashboard from "./components/AgentDashboard";
import AboutPage from "./components/AboutPage";
import SettingsPage from "./components/SettingsPage";
import DataReliability from "./components/DataReliability";
import ContractCopilot from "./components/ContractCopilot";
import GovernancePage from "./components/GovernancePage";
import PersonasPage from "./components/PersonasPage";
import StewardPage from "./components/StewardPage";
import JudgeBanner from "./components/JudgeBanner";
import type { PlaybookInfo } from "./lib/types";
import { fetchSettings } from "./lib/api";

type View =
  | "about"
  | "chat"
  | "playbooks"
  | "playbook-run"
  | "history"
  | "dashboard"
  | "settings"
  | "reliability"
  | "contract-copilot"
  | "governance"
  | "personas"
  | "steward";

const NAV_ITEMS: { view: View; icon: typeof MessageSquare; label: string }[] = [
  { view: "about", icon: Home, label: "About" },
  { view: "chat", icon: MessageSquare, label: "Chat" },
  { view: "playbooks", icon: BookOpen, label: "Playbooks" },
  { view: "contract-copilot", icon: Shield, label: "Contract Copilot" },
  { view: "reliability", icon: ShieldCheck, label: "Reliability" },
  { view: "governance", icon: Activity, label: "Governance" },
  { view: "personas", icon: Users, label: "Personas" },
  { view: "steward", icon: Bot, label: "Operations" },
  { view: "history", icon: Clock, label: "History" },
  { view: "dashboard", icon: BarChart3, label: "Insights" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export default function App() {
  const [view, setView] = useState<View>("about");
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookInfo | null>(
    null
  );
  const [activeModel, setActiveModel] = useState("gemini-2.5-flash");
  const [activeProvider, setActiveProvider] = useState("gemini");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resumeThreadId, setResumeThreadId] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setActiveModel(s.model);
        setActiveProvider(s.provider);
        setBackendOnline(true);
      })
      .catch(() => { setBackendOnline(false); });
  }, []);

  // Periodic health check
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/health");
        setBackendOnline(res.ok);
      } catch { setBackendOnline(false); }
    };
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setView("chat");
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleModelChange = (model: string, provider?: string) => {
    setActiveModel(model);
    if (provider) setActiveProvider(provider);
  };

  const handleResumeConversation = (threadId: string) => {
    setResumeThreadId(threadId);
    setView("chat");
  };

  const handlePlaybookSelect = (pb: PlaybookInfo) => {
    setSelectedPlaybook(pb);
    setView("playbook-run");
  };

  const isActive = (v: View) =>
    v === view || (v === "playbooks" && view === "playbook-run");

  return (
    <div className="flex h-screen bg-surface bg-noise">
      {/* ───── Mobile backdrop ───── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ───── Sidebar ───── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-surface-1/60 backdrop-blur-2xl border-r border-white/[0.04]
                         transform transition-transform duration-300 ease-out
                         md:relative md:z-auto md:w-[220px] md:translate-x-0 md:shrink-0
                         ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />

        {/* Mobile close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-5 right-3 p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition md:hidden"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-7 animate-scale-in">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 animate-glow-pulse">
            <Database size={17} className="text-white relative z-10" />
          </div>
          <div>
            <span className="text-[15px] font-bold text-white tracking-tight font-display">
              Meta<span className="text-brand-400">Flow</span>
            </span>
            <p className="text-[10px] text-zinc-600 leading-none mt-0.5 tracking-wide">MCP Orchestrator</p>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04]" />

        {/* Nav label */}
        <p className="px-5 pt-6 pb-2 text-[10px] text-zinc-600 uppercase tracking-[0.18em] font-semibold">
          Navigation
        </p>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map(({ view: v, icon: Icon, label }, i) => (
            <button
              key={v}
              onClick={() => { setView(v); setSidebarOpen(false); }}
              aria-label={label}
              aria-current={isActive(v) ? "page" : undefined}
              className={`relative flex items-center gap-3 w-full px-3.5 py-3 rounded-xl
                          transition-all duration-300 text-[13px] font-medium animate-fade-up delay-${i + 1}
                          group ${
                isActive(v)
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              {/* Active highlight */}
              {isActive(v) && (
                <>
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600" />
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500/[0.1] to-transparent" />
                  <div className="absolute inset-0 rounded-xl border border-brand-500/[0.12]" />
                </>
              )}
              <div className={`relative shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
                isActive(v)
                  ? "bg-brand-500/15 text-brand-400"
                  : "text-zinc-500 group-hover:text-zinc-300 group-hover:bg-white/[0.03]"
              }`}>
                <Icon size={16} />
              </div>
              <span className="relative font-medium">{label}</span>
              {isActive(v) && (
                <div className="relative ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
            </button>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04]" />

        {/* Sidebar footer */}
        <div className="px-4 py-5 animate-fade-up delay-6">
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl glass-brand">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
              {activeProvider === "openai" ? (
                <OpenAILogo size={14} className="text-brand-400" />
              ) : (
                <GeminiLogo size={14} className="text-brand-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-zinc-300 truncate">{activeModel}</p>
              <p className="text-[10px] text-brand-500/60 leading-none mt-0.5 font-medium">{activeProvider === "openai" ? "ChatGPT" : "Gemini"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ───── Main content ───── */}
      <main className="flex-1 flex flex-col min-w-0">
        <JudgeBanner />
        {/* Top bar */}
        <header className="h-13 border-b border-white/[0.04] bg-surface/80 backdrop-blur-xl flex items-center px-4 md:px-6 shrink-0 relative">
          {/* Accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="mr-3 p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition md:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2.5">
            <Zap size={13} className="text-brand-500/50" />
            <span className="text-xs text-zinc-400 font-semibold tracking-wide">
              {view === "about" && "About"}
              {view === "chat" && "Agent Chat"}
              {(view === "playbooks" || view === "playbook-run") && "Playbooks"}
              {view === "history" && "History"}
              {view === "dashboard" && "Insights"}
              {view === "reliability" && "Data Reliability"}
              {view === "contract-copilot" && "Contract Copilot"}
              {view === "governance" && "Governance"}
              {view === "personas" && "AI Studio Personas"}
              {view === "steward" && "Operations"}
              {view === "settings" && "Settings"}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg bg-brand-500/[0.06] border border-brand-500/[0.1]">
              <div className={`w-1.5 h-1.5 rounded-full ${
                backendOnline === null ? "bg-zinc-600" : backendOnline ? "bg-brand-400 animate-pulse" : "bg-red-400"
              }`} />
              <span className="text-[11px] text-brand-400/80 font-medium hidden sm:inline">
                {backendOnline === null ? "Connecting..." : backendOnline ? "13 Agents Online" : "Backend Offline"}
              </span>
            </div>
            <kbd className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-zinc-600 font-mono">
              Ctrl+K
            </kbd>
          </div>
        </header>

        {/* View */}
        <div className="flex-1 overflow-hidden">
          {view === "about" && <AboutPage onNavigateChat={() => setView("chat")} />}
          {view === "chat" && <ChatPanel resumeThreadId={resumeThreadId} onThreadResumed={() => setResumeThreadId(null)} />}
          {view === "playbooks" && (
            <PlaybookGallery onSelect={handlePlaybookSelect} />
          )}
          {view === "playbook-run" && selectedPlaybook && (
            <PlaybookRunner
              playbook={selectedPlaybook}
              onBack={() => setView("playbooks")}
            />
          )}
          {view === "history" && <ConversationHistory onResume={handleResumeConversation} />}
          {view === "dashboard" && <AgentDashboard />}
          {view === "reliability" && <DataReliability />}
          {view === "contract-copilot" && <ContractCopilot />}
          {view === "governance" && <GovernancePage />}
          {view === "personas" && <PersonasPage />}
          {view === "steward" && <StewardPage />}
          {view === "settings" && <SettingsPage onModelChange={handleModelChange} />}
        </div>

        {/* ───── Footer ───── */}
        <footer className="h-9 border-t border-white/[0.04] bg-surface-1/60 backdrop-blur-xl flex items-center px-3 md:px-6 shrink-0 relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500/40" />
            <span className="text-[11px] text-zinc-500 font-semibold font-display">
              Meta<span className="text-brand-500/60">Flow</span>
            </span>
            <span className="text-[10px] text-zinc-700 font-mono hidden sm:inline">v1.0</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-4 text-[10px] text-zinc-600 font-medium">
            <span>12 <span className="text-zinc-700 hidden sm:inline">agents</span></span>
            <span className="text-brand-500/20">|</span>
            <span>7 <span className="text-zinc-700 hidden sm:inline">platforms</span></span>
            <span className="text-brand-500/20">|</span>
            <span>13 <span className="text-zinc-700 hidden sm:inline">playbooks</span></span>
          </div>
        </footer>
      </main>
    </div>
  );
}
