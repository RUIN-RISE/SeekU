"use client";

import { useState, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useSearch, type SearchResponse } from "@/lib/hooks";

interface SearchBarProps {
  onResults?: (results: SearchResponse) => void;
}

export function SearchBar({ onResults }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const debouncedCallback = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
  }, 300);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    debouncedCallback(e.target.value);
  };

  const { data, isLoading, error } = useSearch(debouncedQuery);

  useEffect(() => {
    if (data && onResults) {
      onResults(data);
    }
  }, [data, onResults]);

  return (
    <>
      {/* 透明输入框 - 叠加在打字机文本上 */}
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        className="w-full h-full bg-transparent border-none outline-none text-slate-900 text-lg px-2 font-medium absolute inset-0 z-20"
        placeholder=""
      />

      {/* 加载指示器 */}
      {isLoading && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="absolute -bottom-8 left-0 text-sm text-red-500 z-30">
          搜索失败，请重试
        </p>
      )}
    </>
  );
}