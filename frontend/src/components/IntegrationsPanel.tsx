/**
 * Integrations panel — configure every platform credential from the UI.
 * No need to edit .env files anymore.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  EmailLogo,
  GitHubLogo,
  GoogleWorkspaceLogo,
  JiraLogo,
  NotionLogo,
  OpenMetadataLogo,
  SlackLogo,
} from "./PlatformLogos";
import type { IntegrationStatus, IntegrationsUpdate } from "../lib/types";
import { fetchIntegrations, updateIntegrations } from "../lib/api";

interface Field {
  readonly key: keyof IntegrationsUpdate;
  readonly label: string;
  readonly placeholder?: string;
  readonly secret?: boolean;
  readonly nonSecretBackendKey?: string; // key to read current value from status.fields
  readonly helper?: string;
  readonly type?: "text" | "number" | "url" | "email";
}

interface IntegrationDef {
  readonly id: string;
  readonly name: string;
  readonly logo: React.FC<{ size?: number; className?: string }>;
  readonly description: string;
  readonly docsUrl?: string;
  readonly fields: readonly Field[];
}

const INTEGRATIONS: readonly IntegrationDef[] = [
  {
    id: "openmetadata",
    name: "OpenMetadata",
    logo: OpenMetadataLogo,
    description: "Primary metadata & lineage source. Required for every reliability feature.",
    docsUrl: "https://docs.open-metadata.org/",
    fields: [
      { key: "om_host", label: "Host URL", placeholder: "http://localhost:8585", nonSecretBackendKey: "host", type: "url" },
      { key: "om_token", label: "JWT Token", placeholder: "eyJhbGciOi...", secret: true, helper: "Create a bot token in OM → Bots." },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    logo: GitHubLogo,
    description: "Auto-file issues, PR automation, code search.",
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
    fields: [
      { key: "github_token", label: "Personal Access Token", placeholder: "ghp_...", secret: true, helper: "Needs repo + issues scope." },
      { key: "github_default_repo", label: "Default Repo", placeholder: "owner/repo", nonSecretBackendKey: "default_repo" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    logo: SlackLogo,
    description: "Send incident alerts and status updates to your channels.",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    fields: [
      { key: "slack_webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/...", secret: true, type: "url" },
    ],
  },
  {
    id: "jira",
    name: "Jira",
    logo: JiraLogo,
    description: "Create and route tickets when tests fail or remediation is drafted.",
    docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    fields: [
      { key: "jira_url", label: "Site URL", placeholder: "https://your-org.atlassian.net", nonSecretBackendKey: "url", type: "url" },
      { key: "jira_user", label: "User Email", placeholder: "you@company.com", nonSecretBackendKey: "user", type: "email" },
      { key: "jira_api_token", label: "API Token", placeholder: "ATATT...", secret: true },
      { key: "jira_project_key", label: "Default Project Key", placeholder: "DATA", nonSecretBackendKey: "project_key" },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    logo: NotionLogo,
    description: "Publish lineage reports and runbooks as Notion pages.",
    docsUrl: "https://developers.notion.com/docs/create-a-notion-integration",
    fields: [
      { key: "notion_api_key", label: "Integration Secret", placeholder: "secret_...", secret: true },
      { key: "notion_database_id", label: "Default Database ID", placeholder: "1a2b3c...", nonSecretBackendKey: "database_id" },
    ],
  },
  {
    id: "google",
    name: "Google Workspace",
    logo: GoogleWorkspaceLogo,
    description: "Drive / Docs / Sheets access via a service-account key file.",
    docsUrl: "https://cloud.google.com/iam/docs/service-account-overview",
    fields: [
      { key: "google_service_account_file", label: "Service Account File Path", placeholder: "/etc/secrets/google-sa.json", nonSecretBackendKey: "service_account_file" },
    ],
  },
  {
    id: "email",
    name: "Email (SMTP)",
    logo: EmailLogo,
    description: "Send summary reports and test-failure notifications via SMTP.",
    fields: [
      { key: "smtp_host", label: "Host", placeholder: "smtp.gmail.com", nonSecretBackendKey: "host" },
      { key: "smtp_port", label: "Port", placeholder: "587", nonSecretBackendKey: "port", type: "number" },
      { key: "smtp_user", label: "Username", placeholder: "alerts@company.com", nonSecretBackendKey: "user", type: "email" },
      { key: "smtp_pass", label: "Password / App Password", placeholder: "••••••••", secret: true },
      { key: "smtp_from", label: "From Address", placeholder: "MetaFlow <alerts@company.com>", nonSecretBackendKey: "from" },
    ],
  },
  {
    id: "webhook",
    name: "OpenMetadata Webhook",
    logo: ShieldIcon,
    description: "Shared secret used to verify incoming OpenMetadata alert webhooks.",
    fields: [
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "long-random-string", secret: true },
    ],
  },
];

function ShieldIcon({ size = 20, className }: { size?: number; className?: string }) {
  return <ShieldCheck size={size} className={className || "text-brand-400"} />;
}

function maskedPlaceholder(field: Field, configured: boolean): string {
  if (field.secret && configured) return "•••••••• (saved)";
  return field.placeholder ?? "";
}

export default function IntegrationsPanel() {
  const [status, setStatus] = useState<IntegrationStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>("openmetadata");
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchIntegrations();
      setStatus(res.integrations);
      // Seed non-secret values from backend so users can edit them
      const seeded: Record<string, string> = {};
      for (const integ of res.integrations) {
        for (const [k, v] of Object.entries(integ.fields ?? {})) {
          seeded[`${integ.id}.${k}`] = v ?? "";
        }
      }
      setValues((prev) => ({ ...seeded, ...prev }));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load integrations");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [load]);

  const statusFor = (id: string) => status?.find((s) => s.id === id);

  const readValue = (integ: IntegrationDef, f: Field): string => {
    // Priority: user-typed > seeded non-secret > empty
    const typed = values[`form.${integ.id}.${String(f.key)}`];
    if (typed !== undefined) return typed;
    if (f.nonSecretBackendKey) {
      return values[`${integ.id}.${f.nonSecretBackendKey}`] ?? "";
    }
    return "";
  };

  const setValue = (integ: IntegrationDef, f: Field, v: string) => {
    setValues((prev) => ({ ...prev, [`form.${integ.id}.${String(f.key)}`]: v }));
  };

  const handleSave = async (integ: IntegrationDef) => {
    setSaving(integ.id);
    const payload: IntegrationsUpdate = {};
    for (const f of integ.fields) {
      const typed = values[`form.${integ.id}.${String(f.key)}`];
      if (typed === undefined) continue;
      if (f.secret && typed === "") continue; // empty secret = no change
      if (f.type === "number") {
        const n = Number(typed);
        if (!Number.isNaN(n)) (payload as Record<string, unknown>)[String(f.key)] = n;
      } else {
        (payload as Record<string, unknown>)[String(f.key)] = typed;
      }
    }
    if (Object.keys(payload).length === 0) {
      showToast("error", "Nothing to save — fill in a field first.");
      setSaving(null);
      return;
    }
    try {
      const res = await updateIntegrations(payload);
      setStatus(res.integrations);
      // Clear only the form scratch for this integration's secrets; keep non-secret edits
      setValues((prev) => {
        const next = { ...prev };
        for (const f of integ.fields) {
          if (f.secret) delete next[`form.${integ.id}.${String(f.key)}`];
        }
        // Refresh seeded non-secret values from server
        const updated = res.integrations.find((i) => i.id === integ.id);
        if (updated) {
          for (const [k, v] of Object.entries(updated.fields ?? {})) {
            next[`${integ.id}.${k}`] = v ?? "";
          }
        }
        return next;
      });
      showToast("success", `${integ.name} saved.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    }
    setSaving(null);
  };

  const handleClear = async (integ: IntegrationDef) => {
    setSaving(integ.id);
    const payload: IntegrationsUpdate = {};
    for (const f of integ.fields) {
      (payload as Record<string, unknown>)[String(f.key)] = f.type === "number" ? 0 : "";
    }
    try {
      const res = await updateIntegrations(payload);
      setStatus(res.integrations);
      // Wipe form scratch for this integration
      setValues((prev) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!k.startsWith(`form.${integ.id}.`) && !k.startsWith(`${integ.id}.`)) next[k] = v;
        }
        return next;
      });
      showToast("success", `${integ.name} credentials cleared.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Clear failed");
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500">
        <Loader2 size={22} className="animate-spin mr-2" /> Loading integrations...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto my-12 p-5 rounded-xl border border-red-500/30 bg-red-500/10">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Could not load integrations</p>
            <p className="text-xs text-red-400/80 mt-1">{loadError}</p>
            <button onClick={load} className="mt-3 text-xs text-red-200 underline">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-700/15 border border-brand-500/20 flex items-center justify-center">
          <Plug size={18} className="text-brand-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100 font-display">Integrations</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure every platform credential here. Secrets are stored on the server and never returned to the UI.
          </p>
        </div>
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 gap-3">
        {INTEGRATIONS.map((integ) => {
          const st = statusFor(integ.id);
          const configured = !!st?.configured;
          const open = expanded === integ.id;
          const LogoComp = integ.logo;
          return (
            <div
              key={integ.id}
              className={`rounded-xl border transition-all ${
                open
                  ? "border-brand-500/30 bg-white/[0.02]"
                  : "border-white/[0.05] bg-white/[0.01] hover:border-white/10"
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : integ.id)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                  <LogoComp size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-100">{integ.name}</span>
                    {configured ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium">
                        <Check size={10} /> Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-zinc-500/10 border border-zinc-500/30 text-zinc-400 font-medium">
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{integ.description}</p>
                </div>
                <span className={`text-[11px] font-semibold ${open ? "text-brand-400" : "text-zinc-500"}`}>
                  {open ? "Close" : "Configure"}
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 border-t border-white/[0.04] pt-4 space-y-3">
                  {integ.fields.map((f) => {
                    const value = readValue(integ, f);
                    const showKey = `form.${integ.id}.${String(f.key)}`;
                    const reveal = !!revealed[showKey];
                    const inputType = f.secret && !reveal ? "password" : (f.type ?? "text");
                    return (
                      <div key={String(f.key)}>
                        <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                          {f.label}
                        </label>
                        <div className="relative">
                          <input
                            type={inputType}
                            value={value}
                            onChange={(e) => setValue(integ, f, e.target.value)}
                            placeholder={maskedPlaceholder(f, configured)}
                            className="w-full px-3 py-2 pr-10 rounded-lg bg-black/30 border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 font-mono"
                          />
                          {f.secret && (
                            <button
                              type="button"
                              onClick={() => setRevealed((p) => ({ ...p, [showKey]: !p[showKey] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-zinc-500 hover:text-zinc-200"
                              aria-label={reveal ? "Hide" : "Show"}
                            >
                              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                        {f.helper && (
                          <p className="text-[10px] text-zinc-600 mt-1">{f.helper}</p>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
                    {integ.docsUrl ? (
                      <a
                        href={integ.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-zinc-500 hover:text-brand-400 underline"
                      >
                        How to get credentials
                      </a>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                      {configured && (
                        <button
                          type="button"
                          onClick={() => handleClear(integ)}
                          disabled={saving === integ.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-semibold hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSave(integ)}
                        disabled={saving === integ.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-semibold hover:bg-brand-500/25 disabled:opacity-50"
                      >
                        {saving === integ.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-xl ${
            toast.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
              : "bg-red-500/15 border-red-500/30 text-red-200"
          }`}
        >
          {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
