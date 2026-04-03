"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { useSearch, type SearchResponse } from "@/lib/hooks";

interface SearchBarProps {
  onResults?: (results: SearchResponse) => void;
}

export function SearchBar({ onResults }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useSearch(searchQuery);

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length > 0) {
      setSearchQuery(trimmed);
    }
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  // Forward results to parent when data arrives
  if (data && onResults) {
    // Use callback ref to avoid calling setState during render
    Promise.resolve().then(() => onResults(data));
  }

  return (
    <>
      {/* 透明输入框 - 叠加在打字机文本上 */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full h-full bg-transparent border-none outline-none text-slate-900 text-lg px-2 font-medium absolute inset-0 z-20"
        placeholder=""
      />

      {/* 搜索按钮 */}
      <button
        onClick={handleSearch}
        disabled={isLoading}
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
        aria-label="搜索"
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Search className="w-5 h-5" />
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <p className="absolute -bottom-8 left-0 text-sm text-red-500 z-30">
          搜索失败，请重试
        </p>
      )}
    </>
  );
}
