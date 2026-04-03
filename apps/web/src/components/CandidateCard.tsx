"use client";

import { useState } from "react";
import { Star, GitBranch, Briefcase, ExternalLink, BadgeCheck, Network } from "lucide-react";
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
  "from-blue-500 to-indigo-500",
  "from-purple-500 to-pink-500",
  "from-green-500 to-teal-500",
  "from-orange-500 to-red-500"
];

function getAvatarGradient(name: string): string {
  const index = name.charCodeAt(0) % avatarGradients.length;
  return avatarGradients[index];
}

// Score ring component (SVG circle)
function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * score) / 100;

  // 颜色根据分数变化
  const getScoreColor = (s: number) => {
    if (s >= 80) return "#10b981"; // green
    if (s >= 60) return "#2563eb"; // blue
    if (s >= 40) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* 背景圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* 进度圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getScoreColor(score)}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* 分数文本 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-800">{Math.round(score)}</span>
      </div>
    </div>
  );
}

export function CandidateCard({ candidate, onSelect }: CandidateCardProps) {
  const [isHovered, setIsHovered] = useState(false);

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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={clsx(
        "bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)]",
        "p-5 cursor-pointer transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]",
        "border border-transparent hover:border-blue-200",
        "relative overflow-hidden"
      )}
    >
      {/* Header: Avatar + Name + Headline + Score */}
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div className="relative">
          <div
            className={clsx(
              "w-14 h-14 rounded-full flex items-center justify-center",
              "bg-gradient-to-br",
              avatarGradient
            )}
          >
            <span className="text-xl font-bold text-white">{firstChar}</span>
          </div>
          {/* 验证标记 */}
          <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
            <BadgeCheck className="w-3 h-3 text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-slate-900 truncate">
              {candidate.name}
            </h3>
            {/* 验证文字标记 */}
            <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
              <BadgeCheck className="w-3 h-3" />
              已验证
            </span>
          </div>
          {candidate.headline && (
            <p className="text-sm text-slate-500 truncate mt-0.5">{candidate.headline}</p>
          )}
        </div>

        {/* 分数环形图 */}
        <ScoreRing score={candidate.matchScore * 100} />
      </div>

      {/* Match Reasons Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {candidate.matchReasons.slice(0, 4).map((reason) => (
          <span
            key={reason}
            className={clsx(
              "px-2.5 py-1 rounded-full text-xs font-medium",
              "bg-blue-50 text-blue-700 border border-blue-100"
            )}
          >
            {reason}
          </span>
        ))}
      </div>

      {/* Evidence Preview */}
      {candidate.evidencePreview.length > 0 && (
        <div className="space-y-2 text-sm text-slate-600">
          {candidate.evidencePreview.slice(0, 3).map((evidence) => (
            <div key={evidence.url ?? evidence.title} className="flex items-center gap-2">
              <EvidenceIcon type={evidence.type} />
              <span className="truncate flex-1">{evidence.title ?? "Untitled"}</span>
              {evidence.stars && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {evidence.stars.toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hover 时显示的按钮 */}
      {isHovered && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(candidate.personId);
            }}
          >
            <Network className="w-4 h-4" />
            查看详情
          </button>
        </div>
      )}
    </article>
  );
}