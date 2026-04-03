"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  WebChatSession,
  extractConditions,
  reviseConditions,
  createEmptyConditions,
  type ChatMessage,
  type SearchConditions
} from "@/lib/chat-session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface SearchResultCard {
  personId: string;
  name: string;
  headline: string | null;
  matchScore: number;
  matchStrength: "strong" | "medium" | "weak";
  matchReasons: string[];
}

interface SearchResponse {
  results: SearchResultCard[];
  total: number;
  intent?: {
    rawQuery: string;
    roles: string[];
    skills: string[];
    locations: string[];
  };
  resultWarning?: string;
}

interface UseChatSessionReturn {
  messages: ChatMessage[];
  currentConditions: SearchConditions;
  isProcessing: boolean;
  sendMessage: (input: string) => Promise<void>;
  reset: () => void;
}

/**
 * React hook for managing chat session state with search integration
 */
export function useChatSession(): UseChatSessionReturn {
  // Use refs to persist the session across renders
  const sessionRef = useRef<WebChatSession | null>(null);
  const isFirstRender = useRef(true);

  // Initialize session on first render
  if (sessionRef.current === null) {
    sessionRef.current = new WebChatSession();
  }

  // State for React reactivity
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConditions, setCurrentConditions] = useState<SearchConditions>(createEmptyConditions());
  const [isProcessing, setIsProcessing] = useState(false);

  // Load from localStorage on first render (client-side only)
  useEffect(() => {
    if (isFirstRender.current && typeof window !== "undefined") {
      sessionRef.current?.loadFromStorage();
      setMessages(sessionRef.current?.messages ?? []);
      setCurrentConditions(sessionRef.current?.currentConditions ?? createEmptyConditions());
      isFirstRender.current = false;
    }
  }, []);

  // Save to localStorage when messages or conditions change
  useEffect(() => {
    if (!isFirstRender.current && typeof window !== "undefined") {
      sessionRef.current?.saveToStorage();
    }
  }, [messages, currentConditions]);

  /**
   * Send a message and handle the search flow
   */
  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || !sessionRef.current) return;

    setIsProcessing(true);

    try {
      // Add user message
      const userMessage = sessionRef.current.addMessage({
        role: "user",
        content: input.trim()
      });
      setMessages([...sessionRef.current.messages]);

      // Determine if this is an initial query or refinement
      const isFirstQuery = sessionRef.current.messages.filter(m => m.role === "user").length === 1;

      let conditions: SearchConditions;

      if (isFirstQuery) {
        // Extract conditions from initial query
        conditions = await extractConditions(input.trim());
      } else {
        // Revise existing conditions based on refinement instruction
        conditions = await reviseConditions(
          sessionRef.current.currentConditions,
          input.trim(),
          "tighten"
        );
      }

      // Update conditions in session
      sessionRef.current.setCurrentConditions(conditions);
      setCurrentConditions(conditions);

      // Build search query from conditions
      const searchQuery = buildSearchQuery(conditions);

      // Call search API
      const searchResponse = await callSearchAPI(searchQuery);

      // Add assistant message with results
      const assistantContent = formatAssistantMessage(searchResponse, conditions, isFirstQuery);
      sessionRef.current.addMessage({
        role: "assistant",
        content: assistantContent,
        toolResult: {
          results: searchResponse.results.map(r => ({
            personId: r.personId,
            name: r.name,
            headline: r.headline,
            matchScore: r.matchScore,
            matchReasons: r.matchReasons
          })),
          total: searchResponse.total
        },
        conditions
      });
      setMessages([...sessionRef.current.messages]);
    } catch (error) {
      console.error("Failed to process message:", error);

      // Add error message
      sessionRef.current?.addMessage({
        role: "assistant",
        content: "抱歉，处理您的请求时遇到错误。请重试或换一种表达方式。"
      });
      setMessages([...(sessionRef.current?.messages ?? [])]);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Reset the session
   */
  const reset = useCallback(() => {
    sessionRef.current?.reset();
    setMessages([]);
    setCurrentConditions(createEmptyConditions());
  }, []);

  return {
    messages,
    currentConditions,
    isProcessing,
    sendMessage,
    reset
  };
}

/**
 * Build search query string from conditions
 */
function buildSearchQuery(conditions: SearchConditions): string {
  const parts: string[] = [];

  if (conditions.skills.length > 0) {
    parts.push(conditions.skills.join(" "));
  }

  if (conditions.locations.length > 0) {
    parts.push(`在 ${conditions.locations.join(" 或 ")}`);
  }

  if (conditions.experience) {
    parts.push(conditions.experience);
  }

  if (conditions.role) {
    parts.push(conditions.role);
  }

  if (conditions.mustHave.length > 0) {
    parts.push(`必须 ${conditions.mustHave.join("、")}`);
  }

  if (conditions.niceToHave.length > 0) {
    parts.push(`优先 ${conditions.niceToHave.join("、")}`);
  }

  if (conditions.exclude.length > 0) {
    parts.push(`排除 ${conditions.exclude.join("、")}`);
  }

  return parts.join(" ") || "搜索候选人";
}

/**
 * Call the search API
 */
async function callSearchAPI(query: string): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: 10
    })
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Format assistant message based on search results
 */
function formatAssistantMessage(
  response: SearchResponse,
  conditions: SearchConditions,
  isFirstQuery: boolean
): string {
  const total = response.total;

  if (isFirstQuery) {
    if (total === 0) {
      return "抱歉，没有找到匹配的候选人。您可以尝试放宽条件或换一种表达方式。";
    }

    const locationStr = conditions.locations.length > 0 ? conditions.locations.join("、") : "";
    const skillStr = conditions.skills.length > 0 ? conditions.skills.join("、") : "";

    let message = `找到 ${total} 位候选人`;
    if (locationStr) message += `（${locationStr}）`;
    if (skillStr) message += `，技能包含 ${skillStr}`;
    if (total <= 3) {
      message += "，以下是全部候选人：";
    } else {
      message += "，以下是前几位：";
    }

    return message;
  } else {
    // Refinement response
    if (total === 0) {
      return "添加条件后没有匹配的候选人。建议放宽条件。";
    }

    const addedConditions = conditions.mustHave.length > 0
      ? `，添加条件"${conditions.mustHave.join("、")}"`
      : "";

    return `筛选后找到 ${total} 位候选人${addedConditions}，以下是结果：`;
  }
}

export type { UseChatSessionReturn, ChatMessage, SearchConditions };