import { useState, useEffect } from "react";
import { Activity, Bot, Layers, RefreshCw, Zap, AlertCircle, Loader2, Heart, WifiOff } from "lucide-react";
import type { DashboardStats } from "../lib/types";
import { fetchDashboardStats } from "../lib/api";
import { timeAgo } from "../lib/timeago";

export default function AgentDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<{ status: string; uptime?: number } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch {
      setError("Could not load dashboard data. Is the backend running?");
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const checkHealth = async () => {
      setHealthLoading(true);
      try {
        const res = await fetch("/health");
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        } else {
          setHealth({ status: "unhealthy" });
        }
      } catch {
        setHealth({ status: "unreachable" });
      }
      setHealthLoading(false);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-fade-in">
        <Loader2 size={28} className="text-brand-500/40 animate-spin mb-3" />
        <p className="text-sm text-zinc-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-fade-in">
        <AlertCircle size={32} className="text-red-400/60 mb-3" />
        <p className="text-sm text-zinc-400 mb-4">{error}</p>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/[0.04] text-zinc-400 hover:text-brand-400 text-sm transition-all duration-300"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const maxAgentCalls = Math.max(...stats.agents.map((a) => a.calls), 1);
  const maxPlatformCalls = Math.max(...stats.platforms.map((p) => p.tool_calls), 1);

  return (
    <div className="h-full overflow-y-auto bg-radial-subtle">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-up">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
              <span className="gradient-text-subtle">Insights</span>
            </h2>
            <p className="text-[15px] text-zinc-500 mt-2">
              Agent activity and platform usage overview.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-9 h-9 rounded-xl flex items-center justify-center glass hover:bg-white/[0.04] text-zinc-500 hover:text-brand-400 transition-all duration-300 disabled:opacity-40"
            title="Refresh"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Inline error banner (shown when refresh fails but previous data exists) */}
        {error && stats && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/15 animate-fade-up">
            <AlertCircle size={15} />
            <span className="flex-1">{error}</span>
            <button onClick={() => load(true)} className="shrink-0 p-1 hover:text-red-300 transition-colors" aria-label="Retry refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {/* Health status card */}
          <div className="glass rounded-xl md:rounded-2xl p-4 md:p-5 card-interactive animate-fade-up group col-span-2 md:col-span-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                healthLoading
                  ? "bg-white/[0.04] border border-white/[0.06]"
                  : health?.status === "ok" || health?.status === "healthy"
                    ? "bg-brand-500/10 border border-brand-500/15"
                    : "bg-red-500/10 border border-red-500/15"
              }`}>
                {healthLoading ? (
                  <Loader2 size={15} className="text-zinc-500 animate-spin" />
                ) : health?.status === "ok" || health?.status === "healthy" ? (
                  <Heart size={15} className="text-brand-400" />
                ) : (
                  <WifiOff size={15} className="text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-zinc-200">
                  {healthLoading ? "Checking..." : health?.status === "ok" || health?.status === "healthy" ? "System Healthy" : "System Unreachable"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {healthLoading ? "Connecting to backend" : health?.status === "ok" || health?.status === "healthy" ? "All services operational" : "Backend is not responding"}
                </p>
              </div>
              <div className={`w-2 h-2 rounded-full ${
                healthLoading ? "bg-zinc-600" : health?.status === "ok" || health?.status === "healthy" ? "bg-brand-400 animate-pulse" : "bg-red-400"
              }`} />
            </div>
          </div>

          {[
            { icon: Activity, label: "Conversations", value: stats.total_conversations },
            { icon: Zap, label: "Messages", value: stats.total_messages },
            { icon: Bot, label: "Agents", value: stats.agents.length },
            { icon: Layers, label: "Platforms", value: stats.platforms.length },
          ].map(({ icon: Icon, label, value }, i) => (
            <div key={label} className={`glass rounded-xl md:rounded-2xl p-4 md:p-5 card-interactive animate-fade-up delay-${i + 1} group`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500/10 to-brand-700/[0.05] border border-brand-500/[0.1] flex items-center justify-center transition-all duration-300 group-hover:from-brand-500/15 group-hover:border-brand-500/20">
                  <Icon size={13} className="text-brand-400" />
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-[0.15em]">{label}</span>
              </div>
              <p className="text-2xl md:text-3xl font-bold font-display gradient-text-subtle">{value}</p>
            </div>
          ))}
        </div>

        {/* Agent usage */}
        <div className="glass rounded-xl md:rounded-2xl p-4 md:p-6 animate-fade-up delay-5">
          <h3 className="text-[14px] md:text-[15px] font-bold text-white font-display mb-4 md:mb-5">Agent Usage</h3>
          {stats.agents.length === 0 ? (
            <p className="text-sm text-zinc-600">No agent calls recorded yet.</p>
          ) : (
            <div className="space-y-3.5">
              {stats.agents.map((agent) => (
                <div key={agent.agent} className="flex items-center gap-3 group">
                  <span className="text-xs text-zinc-500 w-24 md:w-36 truncate font-mono tracking-wide">
                    {agent.agent}
                  </span>
                  <div className="flex-1 bg-white/[0.02] rounded-full h-3.5 overflow-hidden border border-white/[0.03]">
                    <div
                      role="progressbar"
                      aria-valuenow={agent.calls}
                      aria-valuemin={0}
                      aria-valuemax={maxAgentCalls}
                      aria-label={`${agent.agent}: ${agent.calls} calls`}
                      className="h-full rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400 transition-all duration-700 ease-out shadow-glow"
                      style={{ width: `${(agent.calls / maxAgentCalls) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-12 text-right tabular-nums font-semibold">
                    {agent.calls}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform breakdown */}
        <div className="glass rounded-xl md:rounded-2xl p-4 md:p-6 animate-fade-up delay-6">
          <h3 className="text-[14px] md:text-[15px] font-bold text-white font-display mb-4 md:mb-5">Platform Tool Calls</h3>
          {stats.platforms.length === 0 ? (
            <p className="text-sm text-zinc-600">No tool calls recorded yet.</p>
          ) : (
            <div className="space-y-3.5">
              {stats.platforms.map((p) => (
                <div key={p.platform} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-24 md:w-36 truncate tracking-wide">
                    {p.platform}
                  </span>
                  <div className="flex-1 bg-white/[0.02] rounded-full h-3.5 overflow-hidden border border-white/[0.03]">
                    <div
                      role="progressbar"
                      aria-valuenow={p.tool_calls}
                      aria-valuemin={0}
                      aria-valuemax={maxPlatformCalls}
                      aria-label={`${p.platform}: ${p.tool_calls} tool calls`}
                      className="h-full rounded-full bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300 transition-all duration-700 ease-out shadow-glow"
                      style={{ width: `${(p.tool_calls / maxPlatformCalls) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-12 text-right tabular-nums font-semibold">
                    {p.tool_calls}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="glass rounded-xl md:rounded-2xl p-4 md:p-6 animate-fade-up">
          <h3 className="text-[14px] md:text-[15px] font-bold text-white font-display mb-4 md:mb-5">Recent Activity</h3>
          {stats.recent_activity.length === 0 ? (
            <p className="text-sm text-zinc-600">No recent activity.</p>
          ) : (
            <div className="space-y-0.5">
              {stats.recent_activity.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-sm py-3 border-b border-white/[0.03] last:border-0 group hover:bg-white/[0.01] -mx-2 px-2 rounded-lg transition-colors duration-200"
                >
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider ${
                      item.type === "agent_call"
                        ? "bg-brand-500/10 text-brand-400 border border-brand-500/[0.1]"
                        : "bg-white/[0.03] text-zinc-400 border border-white/[0.05]"
                    }`}
                  >
                    {item.type === "agent_call" ? "AGENT" : "CHAT"}
                  </span>
                  <span className="text-zinc-400 flex-1 truncate text-xs group-hover:text-zinc-300 transition-colors">
                    {item.type === "agent_call"
                      ? `${item.agent} -- ${item.duration_ms}ms`
                      : (item.preview as string)}
                  </span>
                  <span className="text-zinc-600 tabular-nums text-[11px]">
                    {timeAgo(item.timestamp as string)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
