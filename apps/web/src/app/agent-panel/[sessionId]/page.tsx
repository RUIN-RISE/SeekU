import { Header } from "@/components/Header";
import { AgentPanel } from "@/components/AgentPanel";

export default async function AgentPanelPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="min-h-screen bg-bg-dark">
      <Header />
      <main>
        <AgentPanel sessionId={sessionId} />
      </main>
    </div>
  );
}
