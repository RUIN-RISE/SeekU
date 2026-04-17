import { Header } from "@/components/Header";
import { DealFlowBoard } from "@/components/DealFlowBoard";

export default async function DealFlowPage({
  searchParams
}: {
  searchParams: Promise<{ personId?: string }>;
}) {
  const { personId } = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 antialiased">
      <Header />
      <DealFlowBoard focusPersonId={personId} />
    </div>
  );
}
