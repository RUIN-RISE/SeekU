"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { EvalDashboard } from "@/components/EvalDashboard";

export default function AdminPage() {
  const [evalMetrics, setEvalMetrics] = useState<{
    avgPrecisionAt5: number;
    avgPrecisionAt10: number;
    avgPrecisionAt20: number;
    coverageRate: number;
  } | null>(null);

  const handleRunEval = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/run-eval`, {
        method: "POST"
      });
      const data = await response.json();
      // For MVP, eval results might not be available yet
      console.log("Eval triggered:", data);
    } catch (error) {
      console.error("Eval failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-bg-light">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <h1 className="font-chinese-display font-bold text-2xl text-text-dark mb-8">
          Admin Dashboard
        </h1>
        <EvalDashboard
          evalMetrics={evalMetrics}
          onRunEval={handleRunEval}
        />
      </main>
    </div>
  );
}