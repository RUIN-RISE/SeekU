"use client";

import { clsx } from "clsx";
import type { ChatMessage as CopilotChatMessage, CopilotMission } from "@/hooks/useChatSession";

interface ChatMessageProps {
  message: CopilotChatMessage;
  mission: CopilotMission | null;
}

export function ChatMessage({ message, mission }: ChatMessageProps) {
  const { role, content, toolResult } = message;

  if (role === "user") {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-sm">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="mb-4 flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seeku</span>
            {mission && (
              <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                mission {mission.phase}
              </span>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm text-slate-700">{content}</p>

          {toolResult && toolResult.results.length > 0 && (
            <div className="mt-3 space-y-2">
              {toolResult.results.slice(0, 5).map((result) => (
                <ResultCard key={result.personId} result={result} />
              ))}
              {toolResult.total > 5 && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  共 {toolResult.total} 位候选人，显示前 5 位
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex justify-start">
      <div className="max-w-[85%] rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">{content}</p>
      </div>
    </div>
  );
}

function ResultCard({
  result
}: {
  result: {
    personId: string;
    name: string;
    headline: string | null;
    disambiguation?: string;
    matchScore: number;
    matchReasons: string[];
  };
}) {
  const scorePercent = Math.round(result.matchScore * 100);
  const scoreColor = scorePercent >= 80 ? "text-green-600" : scorePercent >= 60 ? "text-blue-600" : "text-amber-600";

  return (
    <div className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50 p-3 transition-colors hover:border-blue-200">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium text-slate-900">{result.name}</h4>
            {result.headline && (
              <span className="truncate text-xs text-slate-500">{result.headline}</span>
            )}
          </div>
          {result.disambiguation && (
            <p className="mt-1 line-clamp-2 text-xs text-amber-700">{result.disambiguation}</p>
          )}
          {result.matchReasons.length > 0 && (
            <div className="mt-1 flex gap-1">
              {result.matchReasons.slice(0, 2).map((reason) => (
                <span key={reason} className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ml-3 text-right">
          <span className={clsx("text-sm font-semibold", scoreColor)}>
            {scorePercent}
          </span>
          <span className="ml-0.5 text-xs text-slate-400">%</span>
        </div>
      </div>
    </div>
  );
}
