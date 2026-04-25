import { useState, useEffect } from "react";
import {
  MessageSquare,
  BookOpen,
  Clock,
  BarChart3,
  Database,
  Home,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Shield,
  Activity,
  Users,
  Bot,
  Github,
  BookOpenCheck,
  Sparkles,
  ChevronRight,
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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("mf.sidebarOpen");
    if (saved !== null) return saved === "1";
    return window.innerWidth >= 768;
  });
  const [resumeThreadId, setResumeThreadId] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem("mf.sidebarOpen", sidebarOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [sidebarOpen]);

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
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("chat");
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
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

  // Only auto-close sidebar when navigating on mobile — never on desktop.
  const handleNavClick = (v: View) => {
    setView(v);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const pageMeta: Record<View, { title: string; subtitle: string }> = {
    about: { title: "About", subtitle: "Platform overview & capabilities" },
    chat: { title: "Agent Chat", subtitle: "Talk to the multi-MCP orchestrator" },
    playbooks: { title: "Playbooks", subtitle: "Curated automation blueprints" },
    "playbook-run": { title: "Playbooks", subtitle: "Running execution" },
    history: { title: "History", subtitle: "Past conversations & runs" },
    dashboard: { title: "Insights", subtitle: "Agent activity & KPIs" },
    reliability: { title: "Data Reliability", subtitle: "Test recommendations" },
    "contract-copilot": { title: "Contract Copilot", subtitle: "Draft & manage contracts" },
    governance: { title: "Governance", subtitle: "Policies, PII & compliance" },
    personas: { title: "Personas", subtitle: "Role-aware AI studios" },
    steward: { title: "Operations", subtitle: "Autonomous steward pipeline" },
    settings: { title: "Settings", subtitle: "Providers, models & keys" },
  };

  const current = pageMeta[view];

  return (
    <div className="flex h-screen bg-surface bg-noise overflow-hidden">
      {/* ───── Mobile backdrop ───── */}
      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ───── Sidebar ───── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-surface-1/70 backdrop-blur-2xl border-r border-white/[0.05]
                    transform transition-transform duration-300 ease-out
                    md:relative md:z-auto md:w-[240px] md:shrink-0 md:transition-[transform,width,margin] md:duration-300
                    ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden"}`}
      >
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/[0.04]">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
            <Database size={16} className="text-white relative z-10" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[15px] font-bold text-white tracking-tight font-display block leading-none">
              Meta<span className="text-brand-400">Flow</span>
            </span>
            <p className="text-[10px] text-zinc-500 leading-none mt-1 tracking-wide">MCP Orchestrator</p>
          </div>
        </div>

        {/* Nav label */}
        <p className="px-5 pt-5 pb-2 text-[10px] text-zinc-600 uppercase tracking-[0.18em] font-semibold">
          Navigation
        </p>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto">
          {NAV_ITEMS.map(({ view: v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => handleNavClick(v)}
              aria-label={label}
              aria-current={isActive(v) ? "page" : undefined}
              className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
                          transition-all duration-200 text-[13px] font-medium
                          group ${
                isActive(v)
                  ? "text-white bg-gradient-to-r from-brand-500/[0.12] to-transparent border border-brand-500/[0.15]"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              {isActive(v) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600" />
              )}
              <div className={`relative shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition ${
                isActive(v)
                  ? "bg-brand-500/15 text-brand-400"
                  : "text-zinc-500 group-hover:text-zinc-300"
              }`}>
                <Icon size={15} />
              </div>
              <span className="relative font-medium">{label}</span>
              {isActive(v) && (
                <ChevronRight size={14} className="ml-auto text-brand-400/70" />
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.04] shrink-0">
          <button
            onClick={() => handleNavClick("settings")}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08] transition text-left"
          >
            <div className="w-8 h-8 rounded-md bg-brand-500/10 border border-brand-500/15 flex items-center justify-center shrink-0">
              {activeProvider === "openai" ? (
                <OpenAILogo size={14} className="text-brand-400" />
              ) : (
                <GeminiLogo size={14} className="text-brand-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-zinc-200 truncate leading-tight">{activeModel}</p>
              <p className="text-[10px] text-zinc-500 leading-none mt-1 font-medium capitalize">{activeProvider}</p>
            </div>
            <Settings size={13} className="text-zinc-600 shrink-0" />
          </button>
        </div>
      </aside>

      {/* ───── Main content ───── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* ───── Top bar ───── */}
        <header className="h-16 border-b border-white/[0.05] bg-surface/85 backdrop-blur-xl flex items-center gap-4 px-4 md:px-6 shrink-0 relative">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 -ml-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition shrink-0"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Collapse sidebar (Ctrl+B)" : "Open sidebar (Ctrl+B)"}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          {/* Page title */}
          <div className="flex flex-col min-w-0">
            <h1 className="text-[15px] font-semibold text-white tracking-tight leading-none truncate">
              {current.title}
            </h1>
            <p className="text-[11px] text-zinc-500 leading-none mt-1.5 truncate hidden sm:block">
              {current.subtitle}
            </p>
          </div>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Backend status */}
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition ${
              backendOnline === null
                ? "bg-white/[0.02] border-white/[0.06]"
                : backendOnline
                  ? "bg-brand-500/[0.06] border-brand-500/[0.12]"
                  : "bg-red-500/[0.06] border-red-500/[0.15]"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                backendOnline === null ? "bg-zinc-600" : backendOnline ? "bg-brand-400 animate-pulse" : "bg-red-400"
              }`} />
              <span className={`text-[11px] font-medium hidden sm:inline ${
                backendOnline === null ? "text-zinc-500" : backendOnline ? "text-brand-300" : "text-red-300"
              }`}>
                {backendOnline === null ? "Connecting…" : backendOnline ? "Online" : "Offline"}
              </span>
            </div>

            {/* Chat shortcut */}
            <button
              onClick={() => handleNavClick("chat")}
              className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.1] text-[11px] font-medium text-zinc-400 hover:text-zinc-100 transition"
              title="Jump to Chat (Ctrl+K)"
            >
              <Sparkles size={12} className="text-brand-400" />
              <span>Ask Agent</span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] font-mono text-zinc-500">
                Ctrl+K
              </kbd>
            </button>
          </div>
        </header>

        {/* ───── View ───── */}
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
        <footer className="h-10 border-t border-white/[0.05] bg-surface-1/60 backdrop-blur-xl flex items-center px-4 md:px-6 shrink-0 relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />

          {/* Left: brand */}
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500/50" />
            <span className="text-[11px] text-zinc-400 font-semibold font-display">
              Meta<span className="text-brand-400">Flow</span>
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">v1.0</span>
            <span className="text-zinc-700 hidden md:inline">·</span>
            <span className="text-[10px] text-zinc-600 hidden md:inline">
              Autonomous data-governance orchestrator
            </span>
          </div>

          <div className="flex-1" />

          {/* Middle: stats */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] text-zinc-500 font-medium mr-4">
            <span className="flex items-center gap-1">
              <Bot size={10} className="text-brand-500/60" />
              <span className="text-zinc-300 font-mono">12</span> agents
            </span>
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1">
              <Activity size={10} className="text-brand-500/60" />
              <span className="text-zinc-300 font-mono">7</span> platforms
            </span>
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1">
              <BookOpen size={10} className="text-brand-500/60" />
              <span className="text-zinc-300 font-mono">13</span> playbooks
            </span>
          </div>

          {/* Right: links */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleNavClick("about")}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition"
            >
              <BookOpenCheck size={11} />
              <span className="hidden sm:inline">Docs</span>
            </button>
            <a
              href="https://github.com/open-metadata/OpenMetadata"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition"
            >
              <Github size={11} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <span className="text-zinc-700 mx-1">·</span>
            <span className="text-[10px] text-zinc-600 font-mono hidden sm:inline">
              © 2026
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
