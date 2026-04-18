import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";

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
        <ChatInterface sessionId={sessionId} />
      </main>
    </div>
  );
}
