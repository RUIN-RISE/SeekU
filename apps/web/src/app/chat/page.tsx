import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";

/**
 * Conversational REPL search page
 * Implements D-02: Chat interface replaces single search box as primary interface
 */
export default function ChatPage() {
  return (
    <div className="min-h-screen bg-bg-dark text-text-light antialiased flex flex-col">
      <Header />

      <main className="flex-1 min-h-0">
        <ChatInterface />
      </main>
    </div>
  );
}
