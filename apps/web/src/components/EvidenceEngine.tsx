"use client";

import { useState, useRef } from "react";

interface EvidenceNode {
  id: string;
  title: string;
  description: string;
  icon: string;
  bgColor: string;
  score: number;
}

const EVIDENCE_NODES: EvidenceNode[] = [
  {
    id: "github",
    title: "代码贡献度",
    description: "发现 12 个 Merged PR，涉及 CUDA PagedAttention 优化，代码质量极高，判定为 L5 级别。",
    icon: "github",
    bgColor: "bg-slate-900",
    score: 45
  },
  {
    id: "papers",
    title: "学术影响力",
    description: "关联到 Google Scholar 账号，CVPR 2024 一作，论文被引用 450+ 次。",
    icon: "book-open",
    bgColor: "bg-blue-600",
    score: 30
  },
  {
    id: "kaggle",
    title: "竞赛与社区",
    description: "在 Kaggle LLM 推理优化竞赛中获得 Solo Gold Medal (Top 1%)。",
    icon: "trophy",
    bgColor: "bg-cyan-500",
    score: 23
  }
];

export function EvidenceEngine() {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [showCard, setShowCard] = useState(false);
  const visitedNodesRef = useRef<Set<string>>(new Set());

  const handleNodeHover = (nodeId: string | null, score: number) => {
    setActiveNode(nodeId);
    if (nodeId) {
      setShowCard(true);
      // 只有首次访问该节点时才累加分数，避免重复叠加
      if (!visitedNodesRef.current.has(nodeId)) {
        visitedNodesRef.current.add(nodeId);
        setTotalScore(prev => Math.min(98, prev + score));
      }
    }
  };

  const handleNodeLeave = () => {
    setActiveNode(null);
    // 不重置分数，保持累积效果
  };

  const getNode = (id: string) => EVIDENCE_NODES.find(n => n.id === id);

  const renderIcon = (icon: string) => {
    switch (icon) {
      case "github":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        );
      case "book-open":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      case "trophy":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative w-full bg-white/40 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-8 lg:p-16 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] flex flex-col lg:flex-row items-center justify-between gap-12">
      {/* 左侧：数据源节点 */}
      <div className="flex flex-col gap-6 w-full lg:w-1/3 relative z-10">
        {EVIDENCE_NODES.map((node) => (
          <div
            key={node.id}
            className={`glass-premium rounded-2xl p-5 cursor-crosshair transition-all hover:scale-105 hover:border-blue-300 ${activeNode === node.id ? 'border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'border-transparent'}`}
            onMouseEnter={() => handleNodeHover(node.id, node.score)}
            onMouseLeave={handleNodeLeave}
            style={{
              background: activeNode === node.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
              backdropFilter: 'blur(24px)',
              border: activeNode === node.id ? '1px solid rgba(37,99,235,0.5)' : '1px solid rgba(255,255,255,0.8)'
            }}
          >
            <div className="flex items-center gap-4 mb-2">
              <div className={`w-10 h-10 rounded-full ${node.bgColor} flex items-center justify-center text-white shadow-sm`}>
                {renderIcon(node.icon)}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-[15px]">{node.title}</h4>
                <p className="text-[12px] text-slate-500 font-mono mt-0.5">
                  {node.id === 'github' ? 'API: api.github.com/users' : node.id === 'papers' ? 'Source: Google Scholar' : 'Source: Kaggle / HuggingFace'}
                </p>
              </div>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              {node.id === 'github' && '抓取 PR 记录、Issue 讨论及核心代码变更量（Lines of Code）。'}
              {node.id === 'papers' && '解析顶会（CVPR/NeurIPS）论文发表记录及真实引用率。'}
              {node.id === 'kaggle' && '验证模型开源下载量、竞赛排名及社区声望积累。'}
            </p>
          </div>
        ))}
      </div>

      {/* 右侧：动态计算的人才卡片 */}
      <div className="w-full lg:w-5/12 relative z-10">
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] p-8 relative overflow-hidden transition-all duration-500">
          {/* 扫描光效 */}
          {activeNode && (
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-400/10 to-transparent h-[200%] -top-[100%] animate-pulse pointer-events-none" />
          )}

          <div className="flex justify-between items-start mb-6 relative z-10">
            <div className="flex gap-4 items-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white font-bold text-xl">
                  W
                </div>
                {showCard && (
                  <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1">
                  Wang Wei
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </h3>
                <p className="text-[12px] text-slate-500">AI Research Engineer</p>
              </div>
            </div>

            {/* 分数环形图 */}
            <div className="text-right">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="#f1f5f9" strokeWidth="6" fill="none" />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="#2563eb"
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray="175"
                    strokeDashoffset={175 - (175 * totalScore) / 100}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-800">{totalScore}</span>
                </div>
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">Seeku 分数</span>
            </div>
          </div>

          {/* 解析详情 */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 h-28 flex flex-col justify-center relative z-10">
            {activeNode ? (
              <div>
                <div className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  实时解析结果
                </div>
                <p className="text-[13px] text-slate-700 font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: getNode(activeNode)?.description || '' }} />
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-400 text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                悬停左侧节点查看解析过程
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}