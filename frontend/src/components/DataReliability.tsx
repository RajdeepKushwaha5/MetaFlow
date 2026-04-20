/**
 * Data Reliability — top-level page with 5 tabs:
 *   • Impact Radar — lineage blast-radius graph
 *   • Cause Tree — explainable DQ failure root-cause analysis
 *   • Auto-Remediation — lineage-aware root cause + ticket draft
 *   • Contract Generator — data contracts from lineage + profiler stats
 *   • Test Recommender — one-click DQ test creation
 */

import { useState } from "react";
import {
  Activity,
  GitBranch,
  Sparkles,
  ShieldCheck,
  Target,
  Shield,
} from "lucide-react";
import ImpactRadar from "./ImpactRadar";
import CauseTree from "./CauseTree";
import TestRecommender from "./TestRecommender";
import AutoRemediation from "./AutoRemediation";
import ContractGenerator from "./ContractGenerator";

type Tab = "impact" | "cause" | "remediate" | "contract" | "recommend";

const TABS: { id: Tab; label: string; desc: string; icon: typeof Activity }[] = [
  {
    id: "impact",
    label: "Impact Radar",
    desc: "Visualize blast radius",
    icon: Activity,
  },
  {
    id: "cause",
    label: "Cause Tree",
    desc: "Explain DQ failures",
    icon: GitBranch,
  },
  {
    id: "remediate",
    label: "Auto-Remediate",
    desc: "Lineage-aware root cause",
    icon: Target,
  },
  {
    id: "contract",
    label: "Contracts",
    desc: "Auto-generate data contracts",
    icon: Shield,
  },
  {
    id: "recommend",
    label: "Test Recommender",
    desc: "One-click DQ tests",
    icon: Sparkles,
  },
];

export default function DataReliability() {
  const [tab, setTab] = useState<Tab>("impact");

  return (
    <div className="flex flex-col h-full">
      {/* Hero / tabs header */}
      <div className="px-4 md:px-8 pt-6 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-700/15 border border-brand-500/20 flex items-center justify-center">
            <ShieldCheck size={20} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-zinc-100 font-display">
              Data Reliability Copilot
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Impact · Cause · Auto-remediate · Contracts · Tests — built on OpenMetadata
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(({ id, label, desc, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg border transition group ${
                  active
                    ? "bg-brand-500/15 border-brand-500/35 text-zinc-100"
                    : "bg-white/[0.02] border-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    active ? "bg-brand-500/20 text-brand-400" : "bg-white/[0.03] text-zinc-500"
                  }`}
                >
                  <Icon size={14} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-[10px] text-zinc-500 font-medium">{desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4 md:p-8">
        {tab === "impact" && <ImpactRadar />}
        {tab === "cause" && <CauseTree />}
        {tab === "remediate" && <AutoRemediation />}
        {tab === "contract" && <ContractGenerator />}
        {tab === "recommend" && <TestRecommender />}
      </div>
    </div>
  );
}
