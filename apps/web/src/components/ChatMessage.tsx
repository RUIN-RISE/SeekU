"use client";

import { clsx } from "clsx";
import type { ChatMessage } from "@/hooks/useChatSession";

interface ChatMessageProps {
  message: ChatMessage;
}

/**
 * Individual chat message component
 * Renders user, assistant, or tool (search results) messages
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const { role, content, toolResult } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[85%] bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
          {/* Assistant label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seeku</span>
          </div>

          {/* Content */}
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{content}</p>

          {/* Embedded search results */}
          {toolResult && toolResult.results.length > 0 && (
            <div className="mt-3 space-y-2">
              {toolResult.results.slice(0, 3).map((result) => (
                <ResultCard key={result.personId} result={result} />
              ))}
              {toolResult.total > 3 && (
                <p className="text-xs text-slate-500 text-center mt-2">
                  共 {toolResult.total} 位候选人，显示前 3 位
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Tool role (legacy, not typically used)
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
        <p className="text-xs text-slate-500">{content}</p>
      </div>
    </div>
  );
}

interface ResultCardProps {
  result: {
    personId: string;
    name: string;
    headline: string | null;
    disambiguation?: string;
    matchScore: number;
    matchReasons: string[];
  };
}

/**
 * Mini result card embedded in assistant messages
 */
function ResultCard({ result }: ResultCardProps) {
  const scorePercent = Math.round(result.matchScore * 100);
  const scoreColor = scorePercent >= 80 ? "text-green-600" : scorePercent >= 60 ? "text-blue-600" : "text-amber-600";

  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm text-slate-900 truncate">{result.name}</h4>
            {result.headline && (
              <span className="text-xs text-slate-500 truncate">{result.headline}</span>
            )}
          </div>
          {result.disambiguation && (
            <p className="mt-1 text-xs text-amber-700 line-clamp-2">{result.disambiguation}</p>
          )}

          {/* Match reasons */}
          {result.matchReasons.length > 0 && (
            <div className="flex gap-1 mt-1">
              {result.matchReasons.slice(0, 2).map((reason) => (
                <span key={reason} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs truncate">
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score */}
        <div className="text-right ml-3">
          <span className={clsx("font-semibold text-sm", scoreColor)}>
            {scorePercent}
          </span>
          <span className="text-xs text-slate-400 ml-0.5">%</span>
        </div>
      </div>
    </div>
  );
}
