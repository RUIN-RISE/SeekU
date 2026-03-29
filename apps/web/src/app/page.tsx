"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { ResultsList } from "@/components/ResultsList";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import type { SearchResponse } from "@/lib/api";

export default function HomePage() {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-bg-light">
      {/* Header */}
      <Header />

      {/* Hero Section (dark background per UI-SPEC) */}
      <section className="bg-bg-dark py-16 px-6">
        <div className="max-w-[640px] mx-auto text-center">
          <h1 className="font-chinese-display font-extrabold text-4xl text-text-light mb-3">
            发现AI人才
          </h1>
          <p className="font-body text-lg text-text-light/80 mb-8">
            通过项目代码找到真正合适的人
          </p>
          <SearchBar onResults={setResults} />
        </div>
      </section>

      {/* Results Section (light background) */}
      <section className="bg-bg-light">
        {results && (
          <ResultsList
            data={results}
            onSelectCandidate={setSelectedPersonId}
          />
        )}
      </section>

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
      />
    </div>
  );
}