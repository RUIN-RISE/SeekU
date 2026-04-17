import { Header } from "@/components/Header";
import { DealFlowBoard } from "@/components/DealFlowBoard";

export default function DealFlowPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 antialiased">
      <Header />
      <DealFlowBoard />
    </div>
  );
}
