"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Briefcase, GitBranch, Link, TrendingUp, Star } from "lucide-react";
import { clsx } from "clsx";

interface EvidenceItem {
  id: string;
  evidenceType: string;
  title: string | null;
  description: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
}

interface EvidenceTabsProps {
  evidence: EvidenceItem[];
}

type TabValue = "projects" | "repositories" | "socials" | "signals";

const tabConfig: { value: TabValue; label: string; icon: React.ReactNode; types: string[] }[] = [
  { value: "projects", label: "Projects", icon: <Briefcase className="w-4 h-4" />, types: ["project"] },
  { value: "repositories", label: "Repositories", icon: <GitBranch className="w-4 h-4" />, types: ["repository"] },
  { value: "socials", label: "Socials", icon: <Link className="w-4 h-4" />, types: ["social"] },
  { value: "signals", label: "Job Signals", icon: <TrendingUp className="w-4 h-4" />, types: ["job_signal"] }
];

function groupByType(items: EvidenceItem[]): Record<TabValue, EvidenceItem[]> {
  const grouped: Record<TabValue, EvidenceItem[]> = {
    projects: [],
    repositories: [],
    socials: [],
    signals: []
  };

  for (const item of items) {
    for (const config of tabConfig) {
      if (config.types.includes(item.evidenceType)) {
        grouped[config.value].push(item);
      }
    }
  }

  return grouped;
}

function EvidenceItemCard({ item }: { item: EvidenceItem }) {
  const stars = typeof item.metadata?.stargazers_count === "number" ? item.metadata.stargazers_count : null;
  const language = typeof item.metadata?.language === "string" ? item.metadata.language : null;

  return (
    <div className="p-3 rounded-lg bg-bg-light border border-gray-200">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-body font-medium text-text-dark truncate">
          {item.title ?? "Untitled"}
        </h4>
        {stars && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Star className="w-3 h-3 fill-current" />
            {stars}
          </span>
        )}
      </div>
      {item.description && (
        <p className="text-sm text-text-muted mt-1 line-clamp-2">{item.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        {language && (
          <span className="text-xs px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue">
            {language}
          </span>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-blue hover:underline"
          >
            View
          </a>
        )}
      </div>
    </div>
  );
}

export function EvidenceTabs({ evidence }: EvidenceTabsProps) {
  const grouped = groupByType(evidence);

  return (
    <Tabs.Root defaultValue="projects" className="w-full">
      <Tabs.List className="flex gap-1 border-b border-gray-200 mb-4">
        {tabConfig.map((config) => (
          <Tabs.Trigger
            key={config.value}
            value={config.value}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 font-body text-sm",
              "border-b-2 border-transparent",
              "data-[state=active]:border-accent-blue data-[state=active]:text-accent-blue",
              "data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text-dark"
            )}
          >
            {config.icon}
            {config.label}
            <span className="text-xs bg-bg-light px-1.5 py-0.5 rounded">
              {grouped[config.value].length}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabConfig.map((config) => (
        <Tabs.Content key={config.value} value={config.value} className="grid gap-3">
          {grouped[config.value].length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No items</p>
          ) : (
            grouped[config.value].map((item) => (
              <EvidenceItemCard key={item.id} item={item} />
            ))
          )}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}