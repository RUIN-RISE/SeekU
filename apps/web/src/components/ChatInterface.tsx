"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, RotateCcw } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { useChatSession } from "@/hooks/useChatSession";

/**
 * Chat interface container with message list and input
 * Implements the conversational REPL interface per D-01/D-02
 */
export function ChatInterface() {
  const { messages, isProcessing, sendMessage, reset } = useChatSession();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isProcessing) return;

    setInputValue("");
    await sendMessage(trimmed);

    // Re-focus input after sending
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <h1 className="font-semibold text-slate-800">Seeku 智能搜索</h1>
        </div>

        {/* Reset button */}
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            title="重新开始对话"
          >
            <RotateCcw className="w-3 h-3" />
            重新开始
          </button>
        )}
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-cyan-50 rounded-2xl flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">开始对话搜索</h2>
            <p className="text-sm text-slate-500 max-w-md">
              直接用自然语言描述你想找的人才，比如：
              <br />
              <span className="text-blue-600">"找上海的 AI 工程师"</span>
            </p>
          </div>
        )}

        {/* Message items */}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 bg-white border-t border-slate-200">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              placeholder="继续对话或添加搜索条件..."
              className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isProcessing || !inputValue.trim()}
            className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:bg-blue-400"
            aria-label="发送消息"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Hint */}
        <p className="text-xs text-slate-400 text-center mt-2">
          按 Enter 发送，可以用自然语言添加条件（如 "只要有大模型经验的"）
        </p>
      </div>
    </div>
  );
}