import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Clock, Trash2, MessageSquare, ArrowLeft, AlertCircle, RefreshCw, Loader2, X, Play, Search } from "lucide-react";
import type { ConversationSummary, ConversationDetail } from "../lib/types";
import { fetchConversations, fetchConversation, deleteConversation } from "../lib/api";
import { timeAgo } from "../lib/timeago";

interface Props {
  onResume?: (threadId: string) => void;
}

export default function ConversationHistory({ onResume }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversations();
      setConversations(data);
    } catch {
      setError("Could not load conversations. Is the backend running?");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSelect = async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const conv = await fetchConversation(id);
      setSelected(conv);
    } catch {
      setDetailError("Failed to load conversation details.");
    }
    setDetailLoading(false);
  };

  const handleDeleteClick = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id, title });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteConversation(deleteTarget.id);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      load();
    } catch {
      setDeleteTarget(null);
      setError("Failed to delete conversation. Please try again.");
    }
    setDeleting(false);
  };

  // ---------- Detail view (threaded layout matching ChatPanel) ----------
  if (selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-5 border-b border-white/[0.04] bg-surface-1/60 backdrop-blur-xl flex items-center gap-4 animate-fade-up relative">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/10 to-transparent" />
          <button
            onClick={() => setSelected(null)}
            className="w-8 h-8 rounded-xl flex items-center justify-center glass hover:bg-white/[0.04] text-zinc-500 hover:text-brand-400 transition-all duration-300"
            aria-label="Back to list"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-white truncate font-display">{selected.title}</h2>
            <p className="text-xs text-zinc-500">
              {timeAgo(selected.created_at)}
            </p>
          </div>
          <div className="flex-1" />
          {onResume && (
            <button
              onClick={() => onResume(selected.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500/10 border border-brand-500/15 text-brand-400 text-sm font-medium hover:bg-brand-500/20 transition-all duration-300 shrink-0"
              aria-label="Continue this conversation"
            >
              <Play size={13} />
              <span className="hidden sm:inline">Continue</span>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {selected.messages.map((msg, i) => (
              <div key={i} className="flex items-start gap-3.5 animate-fade-up" style={{ animationDelay: `${i * 0.03}s` }}>
                <div
                  role="img"
                  aria-label={msg.role === "user" ? "User avatar" : "MetaFlow avatar"}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  msg.role === "user"
                    ? "bg-white/[0.05] text-zinc-400 border border-white/[0.06]"
                    : "bg-gradient-to-br from-brand-500/15 to-brand-700/10 text-brand-400 border border-brand-500/[0.12]"
                }`}>
                  {msg.role === "user" ? "U" : "M"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-semibold mb-1.5 uppercase tracking-wider ${
                    msg.role === "user" ? "text-zinc-600" : "text-brand-500/60"
                  }`}>
                    {msg.role === "user" ? "You" : "MetaFlow"}
                  </p>
                  {msg.role === "assistant" ? (
                    <div className="markdown-content prose prose-sm prose-invert max-w-none text-zinc-300">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-200 leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="h-full overflow-y-auto bg-radial-subtle">
      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong rounded-2xl p-6 max-w-sm w-full mx-4 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-white font-display">Delete Conversation</h3>
              <button
                onClick={() => setDeleteTarget(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-all"
                aria-label="Cancel"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-2">Are you sure you want to delete this conversation?</p>
            <p className="text-xs text-zinc-500 truncate mb-6 font-mono">{deleteTarget.title}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.04] text-sm text-zinc-400 font-medium transition-all duration-300"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-all duration-300 disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div className="animate-fade-up">
          <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
            <span className="gradient-text-subtle">History</span>
          </h2>
          <p className="text-[15px] text-zinc-500 mt-2">
            Browse and revisit past conversations.
          </p>
        </div>

        {/* Search bar */}
        {!loading && !error && conversations.length > 0 && (
          <div className="relative animate-fade-up delay-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-11 pr-10 py-3 text-sm text-zinc-200
                         placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/25 focus:bg-white/[0.035] transition-all duration-300"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <Loader2 size={28} className="text-brand-500/40 animate-spin mb-3" />
            <p className="text-sm text-zinc-600">Loading conversations...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <AlertCircle size={32} className="text-red-400/60 mb-3" />
            <p className="text-sm text-zinc-400 mb-4">{error}</p>
            <button
              onClick={() => { setError(null); load(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/[0.04] text-zinc-400 hover:text-brand-400 text-sm transition-all duration-300"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : detailLoading ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <Loader2 size={28} className="text-brand-500/40 animate-spin mb-3" />
            <p className="text-sm text-zinc-600">Loading conversation...</p>
          </div>
        ) : detailError ? (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
            <AlertCircle size={32} className="text-red-400/60 mb-3" />
            <p className="text-sm text-zinc-400 mb-4">{detailError}</p>
            <button
              onClick={() => setDetailError(null)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/[0.04] text-zinc-400 hover:text-brand-400 text-sm transition-all duration-300"
            >
              Back to list
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-zinc-600 mt-24 animate-fade-in">
            <Clock size={36} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm font-semibold text-zinc-500">No conversations yet</p>
            <p className="text-xs mt-1 text-zinc-600">Start a chat to see your history here.</p>
          </div>
        ) : (() => {
          const filtered = search.trim()
            ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            : conversations;
          return filtered.length === 0 ? (
            <div className="text-center text-zinc-600 mt-16 animate-fade-in">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-zinc-500">No conversations match "{search}"</p>
              <button onClick={() => setSearch("")} className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors">Clear search</button>
            </div>
          ) : (
          <div className="space-y-2">
            {filtered.map((conv, idx) => (
              <div
                key={conv.id}
                className={`w-full text-left px-5 py-4 glass rounded-2xl
                           hover:bg-white/[0.06] transition-all duration-300 flex items-center gap-4
                           group card-interactive animate-fade-up delay-${Math.min(idx + 1, 12)}`}
              >
                <div className="flex-1 flex items-center gap-4 min-w-0 cursor-pointer" onClick={() => handleSelect(conv.id)}>
                  <div className="w-9 h-9 bg-gradient-to-br from-brand-500/[0.06] to-brand-700/[0.03] border border-brand-500/[0.08] group-hover:from-brand-500/15 group-hover:border-brand-500/20 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300">
                    <MessageSquare size={16} className="text-zinc-500 group-hover:text-brand-400 transition-colors duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-zinc-200 truncate group-hover:text-white transition-colors duration-300">
                      {conv.title}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5 tracking-wide">
                      {timeAgo(conv.created_at)} -- {conv.message_count} messages
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteClick(conv.id, conv.title, e)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100
                             hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-all duration-300"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          );
        })()}
      </div>
    </div>
  );
}
