/**
 * JudgeBanner — small mode indicator strip rendered above the main app.
 *
 * Shows different banners for:
 *  - Judge Mode (real OM sandbox, autonomous Steward on)
 *  - Demo Mode (mock fixtures, zero-network)
 *  - Live efficiency counter (tokens saved by semantic_search-first)
 */

import { useEffect, useState } from "react";
import { KeyRound, MessagesSquare, Sparkles, Theater, Trophy, Users, Zap } from "lucide-react";
import { fetchSystemInfo, fetchEfficiency, type SystemInfo, type EfficiencySnapshot } from "../lib/api";

export default function JudgeBanner() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [eff, setEff] = useState<EfficiencySnapshot | null>(null);

  useEffect(() => {
    fetchSystemInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const tick = () => {
      fetchEfficiency().then(setEff).catch(() => { /* silent */ });
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  if (!info) return null;

  // Don't render anything if all modes are off and no efficiency to brag about
  const showsTokens = eff && eff.tokens_avoided > 0;
  const showsOAuth = info.auth_mode === "oauth2_client_credentials";
  const showsAiConv = info.conversation_backend === "ai_sdk";
  const showsPersonas = info.personas_supported === true;
  if (
    !info.demo_mode &&
    !info.judge_mode &&
    !showsTokens &&
    !showsOAuth &&
    !showsAiConv &&
    !showsPersonas
  ) return null;

  return (
    <div className="w-full border-b border-white/10 bg-gradient-to-r from-indigo-950 via-slate-950 to-slate-900 text-xs text-slate-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        {info.judge_mode && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5 font-medium text-amber-200">
            <Trophy className="h-3.5 w-3.5" />
            Judge Mode — live against {info.ai_sdk_host.replace(/^https?:\/\//, "")}
          </span>
        )}
        {info.demo_mode && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/20 px-2.5 py-0.5 font-medium text-fuchsia-200">
            <Theater className="h-3.5 w-3.5" />
            Demo Mode — deterministic fixtures, zero network
          </span>
        )}
        {info.steward_enabled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-medium text-emerald-200">
            <Sparkles className="h-3.5 w-3.5" />
            Steward running
          </span>
        )}
        {showsOAuth && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-2.5 py-0.5 font-medium text-cyan-200" title="Auth mode: OAuth 2.0 client_credentials with auto-refresh">
            <KeyRound className="h-3.5 w-3.5" />
            OAuth 2.0 (auto-refresh)
          </span>
        )}
        {showsAiConv && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 font-medium text-blue-200" title="Multi-turn conversations stored in OM via AI SDK">
            <MessagesSquare className="h-3.5 w-3.5" />
            AI SDK conversations
          </span>
        )}
        {showsPersonas && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-0.5 font-medium text-violet-200" title="MetaFlow specialists are published as AI Studio personas in OM">
            <Users className="h-3.5 w-3.5" />
            AI Studio Personas
          </span>
        )}
        {showsTokens && eff && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 py-0.5 font-medium text-indigo-200">
            <Zap className="h-3.5 w-3.5" />
            {eff.tokens_avoided.toLocaleString()} tokens avoided
            {" · "}
            {eff.full_scans_avoided} full scans skipped
            {eff.estimated_usd_saved > 0 && (
              <span className="opacity-70">
                {" · ~$"}
                {eff.estimated_usd_saved.toFixed(4)} saved
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
