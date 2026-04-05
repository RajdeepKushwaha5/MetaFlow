import { useEffect, useState } from "react";
import type { PlaybookInfo } from "../lib/types";
import { fetchPlaybooks } from "../lib/api";

interface Props {
  onSelect: (playbook: PlaybookInfo) => void;
}

export default function PlaybookGallery({ onSelect }: Props) {
  const [playbooks, setPlaybooks] = useState<PlaybookInfo[]>([]);

  useEffect(() => {
    fetchPlaybooks()
      .then(setPlaybooks)
      .catch(() => {
        // Fallback to static data if server not running yet
        setPlaybooks([
          {
            id: "impact-radar",
            name: "Impact Radar",
            icon: "🎯",
            description:
              "Analyze the blast radius of a schema change across lineage.",
            input_label: "Change description",
            input_placeholder: "e.g. Dropping column 'email' from customers table",
            step_count: 3,
          },
          {
            id: "pii-sweep",
            name: "PII Compliance Sweep",
            icon: "🔒",
            description:
              "Scan and tag tables containing PII for governance compliance.",
            input_label: "Search scope",
            input_placeholder: "e.g. All tables in the 'shopify' database",
            step_count: 3,
          },
          {
            id: "dq-fire-drill",
            name: "Data Quality Fire Drill",
            icon: "🚨",
            description:
              "Investigate DQ failures with AI root cause analysis.",
            input_label: "Failure description",
            input_placeholder: "e.g. Null rate spike on orders.amount column",
            step_count: 3,
          },
          {
            id: "metadata-health",
            name: "Metadata Health Doctor",
            icon: "🩺",
            description:
              "Audit metadata completeness and auto-generate descriptions.",
            input_label: "Schema to audit",
            input_placeholder: "e.g. The 'analytics' schema in BigQuery",
            step_count: 3,
          },
          {
            id: "dq-report-notify",
            name: "DQ Report & Notify",
            icon: "📊",
            description:
              "Cross-platform: Find DQ failures, publish GitHub gist, alert Slack.",
            input_label: "DQ scope",
            input_placeholder: "e.g. Tables in the 'ecommerce' database with failed tests",
            step_count: 3,
          },
          {
            id: "pii-track-notify",
            name: "PII Compliance & Track",
            icon: "🛡️",
            description:
              "Cross-platform: Scan PII, tag tables, create GitHub issue, notify Slack.",
            input_label: "Compliance scope",
            input_placeholder: "e.g. All tables in the 'marketing' domain",
            step_count: 4,
          },
          {
            id: "dq-sheet-alert",
            name: "DQ Sheet & Alert",
            icon: "📋",
            description:
              "Cross-platform: Find DQ failures, create Google Sheet report, alert Slack.",
            input_label: "DQ scope",
            input_placeholder: "e.g. Tables in the 'analytics' database with DQ failures",
            step_count: 3,
          },
          {
            id: "metadata-audit-doc",
            name: "Metadata Audit Doc",
            icon: "📝",
            description:
              "Cross-platform: Audit metadata, publish Google Doc, track on GitHub, notify Slack.",
            input_label: "Audit scope",
            input_placeholder: "e.g. All tables in the 'warehouse' schema",
            step_count: 4,
          },
        ]);
      });
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
      {playbooks.map((pb) => (
        <button
          key={pb.id}
          onClick={() => onSelect(pb)}
          className="text-left rounded-xl border border-gray-200 bg-white p-5
                     hover:border-brand-400 hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{pb.icon}</span>
            <h3 className="font-semibold text-gray-900 group-hover:text-brand-700">
              {pb.name}
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-3">{pb.description}</p>
          <div className="text-xs text-gray-400">{pb.step_count} steps</div>
        </button>
      ))}
    </div>
  );
}
