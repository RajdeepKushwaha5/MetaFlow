import { useState, useEffect, useRef, useCallback } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Save,
  Check,
  AlertCircle,
  ChevronDown,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  Cpu,
  Plug,
} from "lucide-react";
import type { LLMSettings, LLMSettingsUpdate } from "../lib/types";
import { fetchSettings, updateSettings } from "../lib/api";
import { GeminiLogo, OpenAILogo } from "./PlatformLogos";
import IntegrationsPanel from "./IntegrationsPanel";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
};

const DEFAULT_SETTINGS: LLMSettings = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  gemini_key_set: false,
  openai_key_set: false,
  gemini_models: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  openai_models: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "o1",
    "o1-mini",
    "o3-mini",
  ],
};

interface SettingsPageProps {
  onModelChange?: (model: string, provider?: string) => void;
}

export default function SettingsPage({ onModelChange }: SettingsPageProps) {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which keys are configured on server
  const [geminiKeySet, setGeminiKeySet] = useState(false);
  const [openaiKeySet, setOpenaiKeySet] = useState(false);

  // Confirmation for removing keys
  const [confirmRemove, setConfirmRemove] = useState<"gemini" | "openai" | null>(null);

  // Error state for initial load
  const [loadError, setLoadError] = useState(false);

  // Active tab: AI model config vs platform integrations
  const [activeTab, setActiveTab] = useState<"llm" | "integrations">("llm");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchSettings();
      setSettings(data);
      setProvider(data.provider);
      setModel(data.model);
      setGeminiKeySet(data.gemini_key_set);
      setOpenaiKeySet(data.openai_key_set);
    } catch {
      setLoadError(true);
      setSettings(DEFAULT_SETTINGS);
      setProvider(DEFAULT_SETTINGS.provider);
      setModel(DEFAULT_SETTINGS.model);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    load();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [load]);

  const modelsForProvider = (p: string): string[] => {
    if (!settings) return [];
    return p === "openai" ? settings.openai_models : settings.gemini_models;
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setModelSearch("");
    const models = modelsForProvider(newProvider);
    if (models.length > 0) {
      // If current model is valid for new provider, keep it, else default
      if (!models.includes(model)) {
        setModel(models[0]);
      }
    }
  };

  const handleSave = async () => {
    // Only validate the API key for the currently selected provider
    if (provider === "gemini") {
      const key = geminiKey || "";
      if (key && key.length < 20) {
        showToast("error", "Gemini API key seems too short. Please double-check it.");
        return;
      }
      if (!key && !geminiKeySet) {
        showToast("error", "Please add a Google Gemini API key before selecting this provider.");
        return;
      }
    }
    if (provider === "openai") {
      const key = openaiKey || "";
      if (key && (!key.startsWith("sk-") || key.length < 20)) {
        showToast("error", "Invalid OpenAI key format. Keys start with \"sk-\" and are 40+ characters.");
        return;
      }
      if (!key && !openaiKeySet) {
        showToast("error", "Please add an OpenAI API key before selecting this provider.");
        return;
      }
    }

    // Ensure a model is selected
    if (!model) {
      showToast("error", "Please select a model.");
      return;
    }

    setSaving(true);
    try {
      const update: LLMSettingsUpdate = {
        provider,
        model,
      };
      if (geminiKey) update.gemini_key = geminiKey;
      if (openaiKey) update.openai_key = openaiKey;

      const result = await updateSettings(update);
      setSettings(result);
      setProvider(result.provider);
      setModel(result.model);
      setGeminiKeySet(result.gemini_key_set);
      setOpenaiKeySet(result.openai_key_set);
      setGeminiKey("");
      setOpenaiKey("");
      onModelChange?.(result.model, result.provider);
      showToast("success", "Settings saved. Orchestrator rebuilt.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      showToast("error", msg);
    }
    setSaving(false);
  };

  const handleRemoveKey = async (which: "gemini" | "openai") => {
    setSaving(true);
    try {
      const update: LLMSettingsUpdate =
        which === "gemini" ? { gemini_key: "" } : { openai_key: "" };
      const result = await updateSettings(update);
      setSettings(result);
      setGeminiKeySet(result.gemini_key_set);
      setOpenaiKeySet(result.openai_key_set);
      // If the active provider's key was removed, warn user
      if (which === provider) {
        showToast("error", `${PROVIDER_LABELS[which]} key removed — switch provider or add a new key to use the orchestrator.`);
      } else {
        showToast("success", `${PROVIDER_LABELS[which]} API key removed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove key";
      showToast("error", msg);
    }
    setSaving(false);
    setConfirmRemove(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm animate-fade-in gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading settings...
      </div>
    );
  }

  if (loadError && !settings) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm animate-fade-in gap-3">
        <AlertCircle size={28} className="text-red-400" />
        <p className="text-zinc-400">Could not connect to the backend.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] transition-colors text-sm"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!settings) return null;

  const currentModels = modelsForProvider(provider);

  return (
    <div className="h-full overflow-y-auto bg-radial-subtle">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="animate-fade-up">
          <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
            <span className="gradient-text-subtle">Settings</span>
          </h2>
          <p className="text-sm md:text-[15px] text-zinc-500 mt-2 leading-relaxed">
            Configure the LLM and every platform connection from one place.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-white/[0.05] -mb-4">
          {([
            { id: "llm", label: "AI Model", icon: Cpu, desc: "Provider + keys" },
            { id: "integrations", label: "Integrations", icon: Plug, desc: "Platform credentials" },
          ] as const).map(({ id, label, icon: Icon, desc }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`relative flex items-center gap-3 px-4 py-3 -mb-px border-b-2 transition ${
                  active
                    ? "border-brand-500 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    active ? "bg-brand-500/15 text-brand-400" : "bg-white/[0.03] text-zinc-500"
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

        {activeTab === "integrations" ? (
          <div className="animate-fade-up">
            <IntegrationsPanel />
          </div>
        ) : (
        <>
        {/* Toast — aria-live region for screen readers */}
        <div aria-live="polite" aria-atomic="true">
          {toast && (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-fade-up ${
                toast.type === "success"
                  ? "bg-brand-500/10 text-brand-400 border border-brand-500/15"
                  : "bg-red-500/10 text-red-400 border border-red-500/15"
              }`}
              role="status"
            >
              {toast.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
              {toast.message}
            </div>
          )}
        </div>

        {/* Backend-offline banner */}
        {loadError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/15 animate-fade-up">
            <AlertCircle size={15} />
            <span className="flex-1">Backend unreachable — showing default settings. Changes won't persist until the backend is online.</span>
            <button onClick={load} className="shrink-0 p-1 hover:text-yellow-300 transition-colors" aria-label="Retry connecting to backend">
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* Provider Selection */}
        <section className="glass rounded-2xl p-6 animate-fade-up delay-1">
          <h3 className="text-[15px] font-bold text-white font-display mb-1.5">
            LLM Provider
          </h3>
          <p className="text-xs text-zinc-500 mb-5">
            Select which AI provider powers the orchestrator.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {(["gemini", "openai"] as const).map((p) => {
              const isActive = provider === p;
              const keyConfigured = p === "gemini" ? geminiKeySet : openaiKeySet;
              return (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`relative rounded-xl p-5 text-left transition-all duration-300 group ${
                    isActive
                      ? "bg-gradient-to-br from-brand-500/[0.08] to-brand-700/[0.04] border-2 border-brand-500/30"
                      : "glass border border-white/[0.06] hover:border-white/[0.1]"
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center">
                      <Check size={11} className="text-brand-400" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    {p === "gemini" ? (
                      <GeminiLogo size={24} />
                    ) : (
                      <OpenAILogo size={24} className="text-zinc-300" />
                    )}
                    <span className={`text-[15px] font-semibold font-display ${isActive ? "text-white" : "text-zinc-400"}`}>
                      {PROVIDER_LABELS[p]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        keyConfigured ? "bg-brand-400" : "bg-zinc-700"
                      }`}
                    />
                    <span className="text-[11px] text-zinc-500">
                      {keyConfigured ? "API key configured" : "No API key"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Model Selection */}
        <section className="glass rounded-2xl p-6 animate-fade-up delay-2 relative z-10">
          <h3 className="text-[15px] font-bold text-white font-display mb-1.5">
            Model
          </h3>
          <p className="text-xs text-zinc-500 mb-5">
            Choose which {PROVIDER_LABELS[provider]} model to use.
          </p>

          <div className="relative" ref={modelDropdownRef}>
            <div
              onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setHighlightIndex(-1); }}
              className="w-full flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[14px] text-zinc-200 font-mono
                         focus-within:border-brand-500/25 focus-within:bg-white/[0.035] focus-within:shadow-glow
                         transition-all duration-300 cursor-pointer"
            >
              {modelDropdownOpen ? (
                <>
                  <Search size={14} className="text-zinc-600 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={modelSearch}
                    onChange={(e) => { setModelSearch(e.target.value); setHighlightIndex(-1); }}
                    onKeyDown={(e) => {
                      const filtered = currentModels.filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()));
                      if (e.key === "Escape") { setModelDropdownOpen(false); setModelSearch(""); setHighlightIndex(-1); }
                      else if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex((i) => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter" && highlightIndex >= 0 && highlightIndex < filtered.length) {
                        e.preventDefault();
                        setModel(filtered[highlightIndex]);
                        setModelDropdownOpen(false);
                        setModelSearch("");
                        setHighlightIndex(-1);
                      }
                    }}
                    placeholder="Search models..."
                    className="flex-1 bg-transparent text-[14px] text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none"
                    aria-label="Search models"
                    aria-controls="model-listbox"
                    aria-activedescendant={highlightIndex >= 0 ? `model-option-${highlightIndex}` : undefined}
                  />
                </>
              ) : (
                <span className="flex-1 truncate">{model || "Select a model"}</span>
              )}
              <ChevronDown
                size={15}
                className={`text-zinc-600 shrink-0 transition-transform duration-200 ${modelDropdownOpen ? "rotate-180" : ""}`}
              />
            </div>

            {modelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setModelDropdownOpen(false); setModelSearch(""); setHighlightIndex(-1); }} />
                <div className="absolute z-20 mt-2 w-full max-h-52 overflow-y-auto rounded-xl border border-white/[0.08] bg-surface-2/95 backdrop-blur-xl shadow-lg py-1" role="listbox" id="model-listbox" aria-label="Available models">
                  {currentModels
                    .filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
                    .map((m, idx) => (
                      <button
                        key={m}
                        type="button"
                        role="option"
                        id={`model-option-${idx}`}
                        aria-selected={m === model ? "true" : "false"}
                        onClick={() => { setModel(m); setModelDropdownOpen(false); setModelSearch(""); setHighlightIndex(-1); }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-mono transition-colors duration-150 flex items-center gap-2
                                   ${m === model
                                     ? "text-brand-400 bg-brand-500/[0.08]"
                                     : idx === highlightIndex
                                     ? "text-white bg-white/[0.08]"
                                     : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                                   }`}
                      >
                        {m === model && <Check size={12} className="text-brand-400 shrink-0" />}
                        <span className={m === model ? "" : "ml-5"}>{m}</span>
                      </button>
                    ))}
                  {currentModels.filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-xs text-zinc-600">No matching models</div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* API Keys */}
        <section className="glass rounded-2xl p-6 animate-fade-up delay-3">
          <h3 className="text-[15px] font-bold text-white font-display mb-1.5">
            API Keys
          </h3>
          <p className="text-xs text-zinc-500 mb-5">
            Add or update your API keys. Keys are stored in server memory for this session.
          </p>

          <div className="space-y-5">
            {/* Gemini Key */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[13px] text-zinc-300 font-semibold flex items-center gap-2">
                  <Key size={13} className="text-zinc-500" />
                  Google Gemini API Key
                </label>
                <div className="flex items-center gap-2">
                  {geminiKeySet && (
                    <>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/15 font-semibold">
                        CONFIGURED
                      </span>
                      <button
                        onClick={() => setConfirmRemove("gemini")}
                        className="p-1 rounded-md hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Remove key"
                        aria-label="Remove Gemini API key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={geminiKeySet ? "Enter new key to update..." : "AIzaSy..."}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 pr-12 text-[14px] text-zinc-200 font-mono
                             placeholder:text-zinc-700 focus:outline-none focus:border-brand-500/25 focus:bg-white/[0.035] focus:shadow-glow
                             transition-all duration-300"
                />
                <button
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                  aria-label={showGeminiKey ? "Hide Gemini API key" : "Show Gemini API key"}
                >
                  {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* OpenAI Key */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[13px] text-zinc-300 font-semibold flex items-center gap-2">
                  <Key size={13} className="text-zinc-500" />
                  OpenAI API Key
                </label>
                <div className="flex items-center gap-2">
                  {openaiKeySet && (
                    <>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/15 font-semibold">
                        CONFIGURED
                      </span>
                      <button
                        onClick={() => setConfirmRemove("openai")}
                        className="p-1 rounded-md hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Remove key"
                        aria-label="Remove OpenAI API key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="relative">
                <input
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={openaiKeySet ? "Enter new key to update..." : "sk-..."}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 pr-12 text-[14px] text-zinc-200 font-mono
                             placeholder:text-zinc-700 focus:outline-none focus:border-brand-500/25 focus:bg-white/[0.035] focus:shadow-glow
                             transition-all duration-300"
                />
                <button
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                  aria-label={showOpenaiKey ? "Hide OpenAI API key" : "Show OpenAI API key"}
                >
                  {showOpenaiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="animate-fade-up delay-4">
          <button
            onClick={handleSave}
            disabled={saving || loadError}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl
                       bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-sm tracking-wide
                       hover:from-brand-400 hover:to-brand-500 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-300 btn-shimmer shadow-glow"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {saving ? "Saving..." : "Save & Rebuild Orchestrator"}
          </button>
          <p className="text-[11px] text-zinc-600 text-center mt-3">
            Saving will rebuild the orchestrator with the new configuration.
          </p>
        </div>
        </>
        )}
      </div>

      {/* Remove Key Confirmation Modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong rounded-2xl p-6 max-w-sm mx-4 w-full shadow-xl animate-scale-in">
            <h3 className="text-base font-bold text-white font-display mb-2">Remove API Key</h3>
            <p className="text-sm text-zinc-400 mb-5">
              Remove the <span className="text-zinc-200 font-semibold">{PROVIDER_LABELS[confirmRemove]}</span> API key? You'll need to re-enter it to use this provider again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveKey(confirmRemove)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-40"
              >
                {saving ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
