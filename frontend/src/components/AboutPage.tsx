import {
  Database,
  Zap,
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
      { id: "input", type: "input" as const, label: "Your Request", icon: MessageSquare, x: 0, detail: "Natural language — no syntax needed" },
      { id: "supervisor", type: "process" as const, label: "Supervisor", icon: Cpu, x: 1, detail: "Analyzes intent, picks agents" },
      { id: "dq", type: "agent" as const, label: "DQ Agent", icon: Search, x: 2, detail: "root_cause_analysis()" },
      { id: "jira", type: "agent" as const, label: "Jira Agent", icon: FileText, x: 3, detail: "create_jira_issue()" },
      { id: "email", type: "agent" as const, label: "Email Agent", icon: Send, x: 4, detail: "send_email_report()" },
      { id: "output", type: "output" as const, label: "Response", icon: Check, x: 5, detail: "Summary + Jira link + confirmation" },
    ],
  },
  {
    id: "pii",
    label: "PII Compliance Sweep",
    userMessage: "Scan for PII columns, tag them in the catalog, create GitHub issue, and notify Slack",
    nodes: [
      { id: "input", type: "input" as const, label: "Your Request", icon: MessageSquare, x: 0, detail: "Natural language — no syntax needed" },
      { id: "supervisor", type: "process" as const, label: "Supervisor", icon: Cpu, x: 1, detail: "Analyzes intent, picks agents" },
      { id: "gov", type: "agent" as const, label: "Governance", icon: Shield, x: 2, detail: "semantic_search() + patch_entity()" },
      { id: "github", type: "agent" as const, label: "GitHub Agent", icon: GitBranch, x: 3, detail: "create_github_issue()" },
      { id: "slack", type: "agent" as const, label: "Slack Agent", icon: Send, x: 4, detail: "send_slack_alert()" },
      { id: "output", type: "output" as const, label: "Response", icon: Check, x: 5, detail: "PII report + issue link + Slack notification" },
    ],
  },
  {
    id: "lineage",
    label: "Lineage Investigation",
    userMessage: "Trace lineage for the orders table and document it in Notion",
    nodes: [
      { id: "input", type: "input" as const, label: "Your Request", icon: MessageSquare, x: 0, detail: "Natural language — no syntax needed" },
      { id: "supervisor", type: "process" as const, label: "Supervisor", icon: Cpu, x: 1, detail: "Analyzes intent, picks agents" },
      { id: "lineage", type: "agent" as const, label: "Lineage Agent", icon: GitBranch, x: 2, detail: "get_entity_lineage()" },
      { id: "notion", type: "agent" as const, label: "Notion Agent", icon: FileText, x: 3, detail: "create_notion_page()" },
      { id: "output", type: "output" as const, label: "Response", icon: Check, x: 4, detail: "Lineage map + Notion page link" },
    ],
  },
];

/* ── Interactive flow diagram for "How It Works" ── */

function HowItWorksFlow({ onNavigateChat }: { onNavigateChat: () => void }) {
  const [activeScenario, setActiveScenario] = useState(0);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState(-1);

  const scenario = FLOW_SCENARIOS[activeScenario];

  const typeColors: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    input: { border: "border-blue-500/30", bg: "from-blue-500/[0.08] to-blue-700/[0.04]", text: "text-blue-400", glow: "shadow-[0_0_20px_rgba(59,130,246,0.15)]" },
    process: { border: "border-amber-500/30", bg: "from-amber-500/[0.08] to-amber-700/[0.04]", text: "text-amber-400", glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]" },
    agent: { border: "border-brand-500/30", bg: "from-brand-500/[0.08] to-brand-700/[0.04]", text: "text-brand-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]" },
    output: { border: "border-purple-500/30", bg: "from-purple-500/[0.08] to-purple-700/[0.04]", text: "text-purple-400", glow: "shadow-[0_0_20px_rgba(168,85,247,0.15)]" },
  };

  const runAnimation = () => {
    if (animating) return;
    setAnimating(true);
    setAnimStep(0);
    let step = 0;
    const iv = setInterval(() => {
      step++;
      if (step >= scenario.nodes.length) {
        clearInterval(iv);
        setTimeout(() => { setAnimating(false); setAnimStep(-1); }, 1200);
      } else {
        setAnimStep(step);
      }
    }, 600);
  };

  return (
    <div className="space-y-6 animate-fade-up delay-2">
      {/* Scenario tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {FLOW_SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => { setActiveScenario(i); setAnimStep(-1); setAnimating(false); setActiveNode(null); }}
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

      {/* Flow canvas */}
      <div className="relative glass rounded-2xl p-5 md:p-8 overflow-x-auto">
        {/* Animated play button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={runAnimation}
            disabled={animating}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300
              ${animating
                ? "bg-brand-500/10 text-brand-400/50 cursor-not-allowed"
                : "bg-brand-500/15 text-brand-400 hover:bg-brand-500/25 border border-brand-500/20"
              }`}
          >
            <Zap size={12} className={animating ? "animate-pulse" : ""} />
            {animating ? "Running..." : "Simulate Flow"}
          </button>
        </div>

        {/* Node flow — horizontal scroll on mobile */}
        <div className="flex items-center gap-0 min-w-max mx-auto justify-center">
          {scenario.nodes.map((node, i) => {
            const colors = typeColors[node.type];
            const isActive = activeNode === node.id;
            const isAnimActive = animStep >= i;
            const isAnimCurrent = animStep === i;
            const NodeIcon = node.icon;

            return (
              <div key={node.id} className="flex items-center">
                {/* Node card */}
                <div
                  onMouseEnter={() => setActiveNode(node.id)}
                  onMouseLeave={() => setActiveNode(null)}
                  className={`relative flex flex-col items-center gap-2.5 px-4 py-4 md:px-5 md:py-5 rounded-xl border backdrop-blur-sm
                    bg-gradient-to-br transition-all duration-500 cursor-pointer group min-w-[110px]
                    ${colors.border} ${colors.bg}
                    ${isActive || isAnimCurrent ? colors.glow + " scale-105 border-opacity-100" : "hover:" + colors.glow}
                    ${isAnimActive && animating ? "opacity-100" : animating && !isAnimActive ? "opacity-30" : "opacity-100"}`}
                >
                  {/* Pulse ring on active animation */}
                  {isAnimCurrent && animating && (
                    <div className={`absolute inset-0 rounded-xl border-2 ${colors.border} animate-ping opacity-30`} />
                  )}

                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.bg} border ${colors.border}
                    flex items-center justify-center transition-all duration-300
                    ${isAnimCurrent && animating ? "scale-110" : ""}`}>
                    <NodeIcon size={18} className={`${colors.text} transition-all duration-300`} />
                  </div>

                  <span className={`text-xs font-bold font-display ${isActive || isAnimCurrent ? "text-white" : "text-zinc-300"} transition-colors`}>
                    {node.label}
                  </span>

                  {/* Tool badge */}
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${isActive || isAnimCurrent ? "bg-white/[0.08] text-zinc-200" : "bg-white/[0.03] text-zinc-500"} transition-all`}>
                    {node.detail}
                  </span>

                  {/* Type label */}
                  <span className={`text-[9px] uppercase tracking-[0.12em] font-semibold ${colors.text} opacity-60`}>
                    {node.type}
                  </span>
                </div>

                {/* Connector line */}
                {i < scenario.nodes.length - 1 && (
                  <div className="flex items-center mx-1 md:mx-2">
                    <svg width="48" height="24" viewBox="0 0 48 24" className="shrink-0">
                      <path
                        d="M0 12 C16 12, 20 4, 24 4 S32 12, 48 12"
                        fill="none"
                        stroke={isAnimActive && animating && animStep > i ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.08)"}
                        strokeWidth="2"
                        strokeDasharray={isAnimActive && animating && animStep > i ? "0" : "4 4"}
                        className="transition-all duration-500"
                      />
                      {/* Animated dot */}
                      {animating && animStep === i + 1 && (
                        <circle r="3" fill="#10b981" className="animate-pulse">
                          <animateMotion dur="0.6s" repeatCount="1" path="M0 12 C16 12, 20 4, 24 4 S32 12, 48 12" />
                        </circle>
                      )}
                      {/* Arrow head */}
                      <polygon
                        points="43,8 48,12 43,16"
                        fill={isAnimActive && animating && animStep > i ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.1)"}
                        className="transition-all duration-500"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-6 pt-4 border-t border-white/[0.04]">
          {[
            { type: "input", label: "Input" },
            { type: "process", label: "Supervisor" },
            { type: "agent", label: "Agent" },
            { type: "output", label: "Output" },
          ].map((l) => (
            <div key={l.type} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${typeColors[l.type].border} bg-gradient-to-br ${typeColors[l.type].bg} border`} />
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{l.label}</span>
            </div>
          ))}
        </div>
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
