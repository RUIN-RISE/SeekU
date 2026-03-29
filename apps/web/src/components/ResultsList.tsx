"use client";

import { CandidateCard } from "./CandidateCard";
import type { SearchResponse } from "@/lib/api";

interface ResultsListProps {
  data: SearchResponse;
  onSelectCandidate: (personId: string) => void;
}

export function ResultsList({ data, onSelectCandidate }: ResultsListProps) {
  if (!data.results.length) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg">No candidates found</p>
        <p className="text-sm mt-2">Try a different search query</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 py-8">
      {/* Results Count */}
      <h2 className="font-chinese-display font-bold text-lg text-text-dark mb-6">
        找到 {data.total} 位候选人
      </h2>

      {/* Results Grid */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
        {data.results.map((candidate) => (
          <CandidateCard
            key={candidate.personId}
            candidate={candidate}
            onSelect={onSelectCandidate}
          />
        ))}
      </div>
    </div>
  );
}