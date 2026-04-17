"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, RotateCcw } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatCopilotWorkboard } from "./ChatCopilotWorkboard";
import { useChatSession } from "@/hooks/useChatSession";

export function ChatInterface() {
  const {
    messages,
    isProcessing,
    sendMessage,
    reset,
    mission,
    snapshot,
    events
  } = useChatSession();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isProcessing) return;

    setInputValue("");
    await sendMessage(trimmed);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
      <div className="flex min-h-0 flex-col bg-slate-50">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <div>
              <h1 className="font-semibold text-slate-800">Seeku 智能搜索</h1>
              <p className="text-xs text-slate-500">
                {mission
                  ? `Mission ${mission.phase} · round ${mission.roundCount}`
                  : "Mission-ready chat copilot"}
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="重新开始对话"
            >
              <RotateCcw className="h-3 w-3" />
              重新开始
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-50">
                <Send className="h-8 w-8 text-blue-500" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-slate-800">开始前台长任务搜索</h2>
              <p className="max-w-md text-sm text-slate-500">
                直接描述更大范围的搜索目标，比如：
                <br />
                <span className="text-blue-600">"帮我持续找上海的 agent infra 候选人，自动收敛后再停"</span>
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} mission={mission} />
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                placeholder={mission ? "运行中可随时插话纠偏..." : "描述一个大范围候选搜索任务..."}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={isProcessing || !inputValue.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50"
              aria-label="发送消息"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>

          <p className="mt-2 text-center text-xs text-slate-400">
            {mission
              ? "Mission 运行中可插话，例如：先只看上海 / 别看 academic-heavy / 先给我结果"
              : "发起后，agent 会前台持续搜索、收敛并自动停在明确结果点"}
          </p>
        </div>
      </div>

      <section className="min-h-0 border-l border-slate-200 bg-white">
        <ChatCopilotWorkboard
          snapshot={snapshot}
          events={events}
          mission={mission}
        />
      </section>
    </div>
  );
}
