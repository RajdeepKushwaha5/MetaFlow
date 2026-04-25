import {
  Database,
  ArrowRight,
  Bot,
  Layers,
  Radio,
  LayoutGrid,
  Sparkles,
  MessageSquare,
  Cpu,
  GitBranch,
  Search,
  Shield,
  FileText,
  Send,
  Check,
  Target,
  FileCode2,
  Tag,
} from "lucide-react";
import { useState } from "react";
import {
  OpenMetadataLogo,
  GitHubLogo,
  SlackLogo,
  GoogleWorkspaceLogo,
  JiraLogo,
  NotionLogo,
  EmailLogo,
} from "./PlatformLogos";
import MiniFlow from "./MiniFlow";

interface Props {
  onNavigateChat: () => void;
}

const STATS = [
  { value: "12", label: "AI Agents" },
  { value: "7", label: "Platforms" },
  { value: "13", label: "Playbooks" },
  { value: "17", label: "API Routes" },
];

const PLATFORMS = [
  { logo: OpenMetadataLogo, name: "OpenMetadata" },
  { logo: GitHubLogo, name: "GitHub" },
  { logo: SlackLogo, name: "Slack" },
  { logo: GoogleWorkspaceLogo, name: "Google Workspace" },
  { logo: JiraLogo, name: "Jira" },
  { logo: NotionLogo, name: "Notion" },
  { logo: EmailLogo, name: "Email" },
];

const FEATURES = [
  {
    icon: Shield,
    title: "Data Reliability Copilot",
    description:
      "Visual impact radar, explainable cause trees, and one-click DQ test generation — turn catalog signals into action.",
  },
  {
    icon: Target,
    title: "Lineage-Aware Auto-Remediation",
    description:
      "When a test fails, walk column-level lineage upstream, detect the drifted source, resolve the owner, and draft GitHub + Jira tickets automatically.",
  },
  {
    icon: FileCode2,
    title: "Contract-from-Lineage",
    description:
      "Synthesize data contracts from upstream sources + profiler history: schema expectations, SLAs, and quality gates — publish back to OpenMetadata with one click.",
  },
  {
    icon: Tag,
    title: "Governance-as-Chat",
    description:
      "Create glossary terms, classifications, tags, owners, and tier labels from natural language. The agent mutates OpenMetadata directly via its REST API.",
  },
  {
    icon: Bot,
    title: "AI Orchestration",
    description:
      "Intelligent supervisor agent powered by Google Gemini routes your request to the right specialized agent automatically.",
  },
  {
    icon: LayoutGrid,
    title: "Pre-built Playbooks",
    description:
      "13 ready-to-run workflows for common tasks: PII sweeps, lineage tracing, DQ test recommendations, incident triage, and more.",
  },
  {
    icon: Layers,
    title: "Multi-Platform",
    description:
      "Connects to 7 platforms simultaneously. Agents collaborate across GitHub, Slack, Jira, and your data catalog.",
  },
  {
    icon: Radio,
    title: "Real-time Streaming",
    description:
      "Server-sent events deliver agent reasoning and results as they happen. No waiting for batch responses.",
  },
];

const FLOW_SCENARIOS = [
  {
    id: "dq",
    label: "Data Quality Triage",
    userMessage: "Find failing DQ tests on orders table, create a Jira ticket, and email the data team",
    nodes: [
      { id: "input", tone: "input" as const, label: "Your Request", sublabel: "natural language", icon: MessageSquare, col: 0 },
      { id: "supervisor", tone: "process" as const, label: "Supervisor", sublabel: "route intent → agents", icon: Cpu, col: 1 },
      { id: "dq", tone: "agent" as const, label: "DQ Agent", sublabel: "root_cause_analysis()", icon: Search, col: 2, row: 0 },
      { id: "jira", tone: "agent" as const, label: "Jira Agent", sublabel: "create_jira_issue()", icon: FileText, col: 2, row: 1 },
      { id: "email", tone: "agent" as const, label: "Email Agent", sublabel: "send_email_report()", icon: Send, col: 2, row: 2 },
      { id: "output", tone: "output" as const, label: "Response", sublabel: "summary + links", icon: Check, col: 3 },
    ],
    edges: [
      { from: "input", to: "supervisor", label: "prompt" },
      { from: "supervisor", to: "dq" },
      { from: "supervisor", to: "jira" },
      { from: "supervisor", to: "email" },
      { from: "dq", to: "output" },
      { from: "jira", to: "output" },
      { from: "email", to: "output" },
    ],
  },
  {
    id: "pii",
    label: "PII Compliance Sweep",
    userMessage: "Scan for PII columns, tag them in the catalog, create GitHub issue, and notify Slack",
    nodes: [
      { id: "input", tone: "input" as const, label: "Your Request", sublabel: "natural language", icon: MessageSquare, col: 0 },
      { id: "supervisor", tone: "process" as const, label: "Supervisor", sublabel: "route intent → agents", icon: Cpu, col: 1 },
      { id: "gov", tone: "agent" as const, label: "Governance", sublabel: "patch_entity()", icon: Shield, col: 2, row: 0 },
      { id: "github", tone: "agent" as const, label: "GitHub Agent", sublabel: "create_issue()", icon: GitBranch, col: 2, row: 1 },
      { id: "slack", tone: "agent" as const, label: "Slack Agent", sublabel: "send_slack_alert()", icon: Send, col: 2, row: 2 },
      { id: "output", tone: "output" as const, label: "Response", sublabel: "report + notification", icon: Check, col: 3 },
    ],
    edges: [
      { from: "input", to: "supervisor", label: "prompt" },
      { from: "supervisor", to: "gov" },
      { from: "supervisor", to: "github" },
      { from: "supervisor", to: "slack" },
      { from: "gov", to: "output" },
      { from: "github", to: "output" },
      { from: "slack", to: "output" },
    ],
  },
  {
    id: "lineage",
    label: "Lineage Investigation",
    userMessage: "Trace lineage for the orders table and document it in Notion",
    nodes: [
      { id: "input", tone: "input" as const, label: "Your Request", sublabel: "natural language", icon: MessageSquare, col: 0 },
      { id: "supervisor", tone: "process" as const, label: "Supervisor", sublabel: "route intent → agents", icon: Cpu, col: 1 },
      { id: "lineage", tone: "agent" as const, label: "Lineage Agent", sublabel: "get_entity_lineage()", icon: GitBranch, col: 2, row: 0 },
      { id: "notion", tone: "agent" as const, label: "Notion Agent", sublabel: "create_notion_page()", icon: FileText, col: 2, row: 1 },
      { id: "output", tone: "output" as const, label: "Response", sublabel: "map + page link", icon: Check, col: 3 },
    ],
    edges: [
      { from: "input", to: "supervisor", label: "prompt" },
      { from: "supervisor", to: "lineage" },
      { from: "supervisor", to: "notion" },
      { from: "lineage", to: "output" },
      { from: "notion", to: "output" },
    ],
  },
];

/* ── Interactive flow diagram for "How It Works" ── */

function HowItWorksFlow({ onNavigateChat }: Readonly<{ onNavigateChat: () => void }>) {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = FLOW_SCENARIOS[activeScenario];

  return (
    <div className="space-y-5 animate-fade-up delay-2">
      {/* Scenario tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {FLOW_SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActiveScenario(i)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300
              ${i === activeScenario
                ? "bg-brand-500/15 text-brand-400 border border-brand-500/25 shadow-glow"
                : "glass text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* User prompt preview */}
      <div className="glass rounded-xl p-4 max-w-2xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <MessageSquare size={13} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">User prompt</p>
            <p className="text-sm text-zinc-300 leading-relaxed italic">"{scenario.userMessage}"</p>
          </div>
        </div>
      </div>

      {/* React Flow data-flow diagram */}
      <MiniFlow nodes={scenario.nodes} edges={scenario.edges} height={340} />

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4">
        {[
          { tone: "input", label: "Input", color: "bg-blue-500" },
          { tone: "process", label: "Supervisor", color: "bg-amber-500" },
          { tone: "agent", label: "Agent", color: "bg-brand-500" },
          { tone: "output", label: "Output", color: "bg-purple-500" },
        ].map((l) => (
          <div key={l.tone} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-sm ${l.color} opacity-60`} />
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Try it CTA */}
      <div className="text-center">
        <button
          onClick={onNavigateChat}
          className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 font-semibold transition-colors group"
        >
          Try this workflow in the chat
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}

export default function AboutPage({ onNavigateChat }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 md:px-6 bg-radial-hero overflow-hidden py-14 sm:py-16 md:min-h-[560px] md:py-0">
        {/* Decorative orbs — hidden on mobile for cleaner layout */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-brand-500/[0.04] rounded-full blur-3xl hidden sm:block" />
        <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-brand-700/[0.06] rounded-full blur-3xl hidden sm:block" />

        <div className="relative z-10">
          <div className="animate-scale-in mb-4 md:mb-8">
            <div className="w-14 h-14 md:w-18 md:h-18 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 glow-green-lg flex items-center justify-center mx-auto animate-float">
              <Database size={24} className="text-white md:hidden" />
              <Database size={30} className="text-white hidden md:block" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full glass-brand text-brand-400 text-[11px] md:text-xs font-semibold tracking-wide mb-4 md:mb-6 animate-fade-up">
            <Sparkles size={12} />
            Multi-MCP Agent Orchestrator
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold font-display leading-[1.05] tracking-tight animate-fade-up delay-1">
            <span className="gradient-text">Meet MetaFlow</span>
          </h1>

          <p className="mt-4 md:mt-6 text-sm md:text-lg lg:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed animate-fade-up delay-2">
            The AI-powered orchestrator that connects your data catalog to
            every tool your team uses — delivered in real time.
          </p>

          <div className="flex items-center justify-center gap-4 mt-6 md:mt-10 animate-fade-up delay-3">
            <button
              onClick={onNavigateChat}
              className="inline-flex items-center gap-2.5 px-6 py-3 md:px-8 md:py-4 rounded-xl md:rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600
                         text-white font-semibold text-sm tracking-wide hover:from-brand-400 hover:to-brand-500
                         transition-all duration-500 glow-green-sm btn-shimmer group shadow-glow-lg">
              Start a conversation
              <ArrowRight
                size={16}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </button>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-white/[0.04] py-8 md:py-12 px-4 md:px-6 accent-line relative">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`text-center animate-fade-up delay-${Math.min(i + 1, 12)}`}
            >
              <div className="text-3xl md:text-4xl font-bold font-display gradient-text-subtle">
                {s.value}
              </div>
              <div className="mt-2 text-[11px] text-zinc-500 uppercase tracking-[0.18em] font-semibold">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Platforms */}
      <section className="py-12 md:py-20 px-4 md:px-6 bg-mesh">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[11px] text-brand-500/60 uppercase tracking-[0.18em] font-semibold text-center mb-3 animate-fade-up">
            Connected Platforms
          </h2>
          <p className="text-center text-zinc-500 text-sm mb-10 animate-fade-up delay-1">
            Seamlessly integrated with your entire stack
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:gap-4">
            {PLATFORMS.map((p, i) => (
              <div
                key={p.name}
                className={`glass card-interactive flex flex-col items-center gap-2 md:gap-3 px-4 py-4 md:px-7 md:py-6 rounded-xl md:rounded-2xl
                            min-w-[100px] md:min-w-[120px] animate-fade-up delay-${Math.min(i + 1, 12)}`}
              >
                <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <p.logo size={22} />
                </div>
                <span className="text-xs text-zinc-300 font-semibold">
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 md:py-20 px-4 md:px-6 bg-radial-subtle">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[11px] text-brand-500/60 uppercase tracking-[0.18em] font-semibold text-center mb-3 animate-fade-up">
            Core Capabilities
          </h2>
          <p className="text-center text-zinc-400 text-sm md:text-base mb-8 md:mb-12 animate-fade-up delay-1">
            Built for data teams who need to move fast
          </p>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`glass card-interactive rounded-xl md:rounded-2xl p-5 md:p-7 animate-fade-up delay-${Math.min(i + 1, 12)} group`}
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/10 to-brand-700/10 border border-brand-500/[0.12] flex items-center justify-center mb-5 transition-all duration-300 group-hover:from-brand-500/15 group-hover:to-brand-600/15 group-hover:border-brand-500/20">
                  <f.icon size={19} className="text-brand-400" />
                </div>
                <h3 className="text-[17px] font-semibold text-white font-display mb-2.5">
                  {f.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — interactive flow */}
      <section className="py-12 md:py-20 px-4 md:px-6 bg-mesh">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-[11px] text-brand-500/60 uppercase tracking-[0.18em] font-semibold text-center mb-3 animate-fade-up">
            How It Works
          </h2>
          <p className="text-center text-zinc-400 text-sm md:text-base mb-8 md:mb-10 animate-fade-up delay-1">
            Pick a scenario and see the agent flow in action
          </p>

          <HowItWorksFlow onNavigateChat={onNavigateChat} />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 md:py-20 px-4 md:px-6 text-center relative">
        <div className="absolute inset-0 bg-radial-hero opacity-50" />
        <div className="relative z-10 animate-fade-up">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display mb-4">
            <span className="gradient-text">Ready to orchestrate?</span>
          </h2>
          <p className="text-base text-zinc-500 mb-8 max-w-md mx-auto">
            Jump into the chat and let MetaFlow handle the rest.
          </p>
          <button
            onClick={onNavigateChat}
            className="inline-flex items-center gap-2.5 px-6 py-3 md:px-8 md:py-4 rounded-xl md:rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600
                       text-white font-semibold text-sm tracking-wide hover:from-brand-400 hover:to-brand-500
                       transition-all duration-500 glow-green-sm btn-shimmer group shadow-glow"
          >
            Open Chat
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </button>
        </div>
      </section>
    </div>
  );
}
