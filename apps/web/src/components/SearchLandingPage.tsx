"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { ResultsList } from "@/components/ResultsList";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { EvidenceEngine } from "@/components/EvidenceEngine";
import type { SearchResponse } from "@/lib/api";

const TYPEWRITER_QUERIES = [
  "找出给 vLLM 提交过底层 CUDA 算子优化 PR 的开发者",
  "寻找近三年内有 CVPR 一作，且开源了模型权重的研究员",
  "谁在 GitHub 上用 Rust 重写过 Transformer 推理框架？",
  "Kaggle LLM 竞赛前 50 名，且熟悉 PyTorch DDP 的选手"
];

export function SearchLandingPage() {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [typewriterText, setTypewriterText] = useState("");
  const [showResults, setShowResults] = useState(false);

  const queryIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const typeWriter = () => {
      const currentQuery = TYPEWRITER_QUERIES[queryIndexRef.current];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        setTypewriterText(currentQuery.substring(0, charIndexRef.current));
      } else {
        charIndexRef.current++;
        setTypewriterText(currentQuery.substring(0, charIndexRef.current));
      }

      let typeSpeed = isDeletingRef.current ? 30 : 80;

      if (!isDeletingRef.current && charIndexRef.current === currentQuery.length) {
        typeSpeed = 2500;
        isDeletingRef.current = true;
      } else if (isDeletingRef.current && charIndexRef.current === 0) {
        isDeletingRef.current = false;
        queryIndexRef.current = (queryIndexRef.current + 1) % TYPEWRITER_QUERIES.length;
        typeSpeed = 500;
      }

      timerRef.current = setTimeout(typeWriter, typeSpeed);
    };

    timerRef.current = setTimeout(typeWriter, 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (results && results.results.length > 0) {
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  }, [results]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-800 antialiased">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/40 via-cyan-50/10 to-transparent pointer-events-none z-0" />

      <Header />

      <main className="flex-1 flex flex-col items-center pt-36 pb-20 px-4 sm:px-6 lg:px-8 relative z-10 w-full max-w-7xl mx-auto">
        <a href="#" className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/50 border border-blue-100/80 text-blue-700 text-[11px] font-semibold tracking-widest uppercase hover:bg-blue-50 transition-colors mb-8 shadow-sm backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          全新引擎：自动关联 GitHub 与 Google Scholar
          <svg className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>

        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 text-center tracking-tighter leading-[1.1] mb-6">
          寻找简历上
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 relative">
            写不出来的硬实力
            <svg className="absolute w-full h-3 -bottom-1 left-0 text-blue-200" viewBox="0 0 100 10" preserveAspectRatio="none">
              <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="4" fill="transparent" strokeLinecap="round" />
            </svg>
          </span>
        </h1>

        <p className="text-lg text-slate-500 text-center max-w-2xl leading-loose font-medium mb-8">
          不要再用"精通 Python"来筛选 AI 工程师了。
          <br className="hidden md:block" />
          告诉 Seeku 你遇到的技术瓶颈，AI 为你从全球开源网络中定位破局者。
        </p>

        <div className="w-full max-w-3xl relative z-20">
          <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/10 to-cyan-400/10 rounded-[2rem] blur-xl opacity-50" />

          <div className="relative bg-white rounded-2xl border border-slate-200/80 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] transition-all duration-300">
            <div className="flex items-center p-3 relative z-10">
              <div className="pl-4 pr-3 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="flex-1 relative h-12 flex items-center">
                <div className="text-slate-400 text-lg px-2 font-medium absolute inset-0 flex items-center pointer-events-none">
                  {typewriterText}
                  <span className="animate-pulse ml-0.5 text-blue-500">|</span>
                </div>
                <SearchBar onResults={setResults} />
              </div>
              <div className="flex gap-2 pr-2">
                <kbd className="hidden sm:inline-flex items-center border border-slate-200 rounded-md px-2 py-1 text-[11px] font-sans font-semibold text-slate-400 bg-slate-50 shadow-sm">⌘ K</kbd>
              </div>
            </div>
          </div>
        </div>
      </main>

      {!showResults && (
        <section className="w-full relative z-10 pb-32 pt-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="text-[12px] font-bold text-slate-400 uppercase tracking-widest block mb-2">引擎原理解析</span>
              <h2 className="text-2xl font-bold text-slate-800">悬停查看 AI 如何构建人才证据链</h2>
            </div>
            <EvidenceEngine />
          </div>
        </section>
      )}

      {showResults && (
        <section className="w-full relative z-10 pb-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ResultsList
              data={results!}
              onSelectCandidate={setSelectedPersonId}
            />
          </div>
        </section>
      )}

      <CandidateDetailModal
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
      />
    </div>
  );
}
