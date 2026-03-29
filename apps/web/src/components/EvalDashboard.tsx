"use client";

import { RefreshCw, Play } from "lucide-react";
import { useSyncStatus } from "@/lib/hooks";

interface EvalMetrics {
  avgPrecisionAt5: number;
  avgPrecisionAt10: number;
  avgPrecisionAt20: number;
  coverageRate: number;
}

interface EvalDashboardProps {
  evalMetrics?: EvalMetrics;
  onRunEval?: () => void;
  onTriggerSync?: () => void;
}

export function EvalDashboard({ evalMetrics, onRunEval, onTriggerSync }: EvalDashboardProps) {
  const { data: syncStatus, isLoading: syncLoading } = useSyncStatus();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sync Status Card */}
      <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-6">
        <h3 className="font-chinese-display font-bold text-lg text-text-dark mb-4">
          Sync Status
        </h3>
        {syncLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : syncStatus?.runs?.length > 0 ? (
          <div>
            <p className="text-sm text-text-muted mb-2">
              Last sync: {syncStatus.runs[0].source} ({syncStatus.runs[0].status})
            </p>
            <p className="text-xs text-text-muted">
              {new Date(syncStatus.runs[0].startedAt).toLocaleString()}
            </p>
            <div className="mt-4 space-y-2">
              {syncStatus.runs.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">{run.source}</span>
                  <span className={`px-2 py-0.5 rounded ${
                    run.status === "succeeded" ? "bg-green-100 text-green-700" :
                    run.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No sync runs recorded</p>
        )}
        {onTriggerSync && (
          <button
            onClick={onTriggerSync}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-blue text-text-light rounded-card hover:bg-accent-indigo transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Trigger Sync
          </button>
        )}
      </div>

      {/* Eval Metrics Card */}
      <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-6">
        <h3 className="font-chinese-display font-bold text-lg text-text-dark mb-4">
          Eval Metrics
        </h3>
        {evalMetrics ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@5</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt5.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@10</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt10.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@20</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt20.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Coverage</span>
              <span className="font-mono text-lg text-text-dark">
                {(evalMetrics.coverageRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No eval results yet. Run eval benchmark.</p>
        )}
        {onRunEval && (
          <button
            onClick={onRunEval}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-blue text-text-light rounded-card hover:bg-accent-indigo transition-colors"
          >
            <Play className="w-4 h-4" />
            Run Eval
          </button>
        )}
      </div>
    </div>
  );
}