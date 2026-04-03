"use client";

import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";

/**
 * Conversational REPL search page
 * Implements D-02: Chat interface replaces single search box as primary interface
 */
export default function ChatPage() {
  return (
    <div className="min-h-screen bg-bg-dark text-text-light antialiased flex flex-col">
      {/* Header */}
      <Header />

      {/* Main content - full-height chat interface */}
      <main className="flex-1 flex flex-col">
        <ChatInterface />
      </main>
    </div>
  );
}