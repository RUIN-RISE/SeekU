import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";
import { ChatCopilotWorkboard } from "@/components/ChatCopilotWorkboard";

/**
 * Conversational REPL search page
 * Implements D-02: Chat interface replaces single search box as primary interface
 */
export default async function ChatPage({
  searchParams
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { sessionId } = await searchParams;

  return (
    <div className="min-h-screen bg-bg-dark text-text-light antialiased flex flex-col">
      <Header />

      <main className="flex-1 min-h-0">
        <div className="grid h-full min-h-[calc(100vh-60px)] grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
          <section className="min-h-0 border-b border-slate-800 xl:border-b-0 xl:border-r xl:border-slate-800">
            <ChatInterface />
          </section>
          <section className="min-h-0 bg-white">
            <ChatCopilotWorkboard sessionId={sessionId} />
          </section>
        </div>
      </main>
    </div>
  );
}
