"use client";

import { Star, GitBranch, Briefcase, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import type { SearchResultCard } from "@/lib/api";

interface CandidateCardProps {
  candidate: SearchResultCard;
  onSelect?: (personId: string) => void;
}

interface EvidenceIconProps {
  type: string;
}

function EvidenceIcon({ type }: EvidenceIconProps) {
  switch (type) {
    case "repository":
      return <GitBranch className="w-4 h-4" />;
    case "project":
      return <Briefcase className="w-4 h-4" />;
    default:
      return <ExternalLink className="w-4 h-4" />;
  }
}

// Avatar gradient colors for visual variety
const avatarGradients = [
  "from-accent-blue to-accent-indigo",
  "from-purple-500 to-pink-500",
  "from-green-500 to-teal-500",
  "from-orange-500 to-red-500"
];

function getAvatarGradient(name: string): string {
  const index = name.charCodeAt(0) % avatarGradients.length;
  return avatarGradients[index];
}

export function CandidateCard({ candidate, onSelect }: CandidateCardProps) {
  const handleClick = () => {
    if (onSelect) {
      onSelect(candidate.personId);
    }
  };

  const avatarGradient = getAvatarGradient(candidate.name);
  const firstChar = candidate.name.charAt(0);

  return (
    <article
      onClick={handleClick}
      className={clsx(
        "bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)]",
        "p-4 cursor-pointer transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      )}
    >
      {/* Header: Avatar + Name + Headline */}
      <div className="flex items-start gap-4 mb-3">
        <div
          className={clsx(
            "w-16 h-16 rounded-full flex items-center justify-center",
            "bg-gradient-to-br",
            avatarGradient
          )}
        >
          <span className="text-2xl font-bold text-white">{firstChar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-chinese-display font-bold text-lg text-text-dark truncate">
            {candidate.name}
          </h3>
          {candidate.headline && (
            <p className="text-sm text-text-muted truncate">{candidate.headline}</p>
          )}
        </div>
      </div>

      {/* Match Score Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={clsx(
            "px-3 py-1 rounded-full text-sm font-mono",
            "bg-bg-dark text-text-light"
          )}
        >
          {candidate.matchScore.toFixed(1)}
        </span>

        {/* Match Reasons Tags */}
        <div className="flex gap-1 overflow-hidden">
          {candidate.matchReasons.slice(0, 3).map((reason) => (
            <span
              key={reason}
              className={clsx(
                "px-2 py-1 rounded text-xs font-body",
                "bg-accent-blue/10 text-accent-blue"
              )}
            >
              {reason}
            </span>
          ))}
        </div>
      </div>

      {/* Evidence Preview */}
      {candidate.evidencePreview.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-text-muted">
          {candidate.evidencePreview.slice(0, 3).map((evidence) => (
            <div key={evidence.url ?? evidence.title} className="flex items-center gap-2">
              <EvidenceIcon type={evidence.type} />
              <span className="truncate">{evidence.title ?? "Untitled"}</span>
              {evidence.stars && (
                <span className="flex items-center gap-1 text-xs">
                  <Star className="w-3 h-3 fill-current" />
                  {evidence.stars}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}