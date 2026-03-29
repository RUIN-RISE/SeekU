"use client";

import { useState, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "lucide-react";
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
    <div className="w-full max-w-[640px] mx-auto">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          value={inputValue}
          placeholder="Find AI engineers with RAG experience in Beijing..."
          onChange={handleInputChange}
          className="w-full h-14 pl-12 pr-4 text-lg font-body bg-bg-white border-2 border-transparent rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] focus:border-accent-blue focus:shadow-[0_0_0_4px_rgba(37,99,235,0.2)] focus:outline-none transition-all duration-200"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-500">
          Search failed. Please try again.
        </p>
      )}
    </div>
  );
}