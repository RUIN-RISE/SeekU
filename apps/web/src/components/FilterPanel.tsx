"use client";

import { useState } from "react";
import { X, ChevronDown, MapPin, Code, Clock, Building2 } from "lucide-react";
import { clsx } from "clsx";

interface FilterPanelProps {
  onFilterChange?: (filters: FilterState) => void;
}

export interface FilterState {
  locations: string[];
  skills: string[];
  experience: string[];
  companies: string[];
}

const LOCATION_OPTIONS = ["北京", "上海", "深圳", "杭州", "成都", "远程"];
const SKILL_OPTIONS = ["Python", "PyTorch", "RAG", "LLM", "CUDA", "Rust", "Go", "TypeScript"];
const EXPERIENCE_OPTIONS = ["1-3年", "3-5年", "5-10年", "10年以上"];

export function FilterPanel({ onFilterChange }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterState>({
    locations: [],
    skills: [],
    experience: [],
    companies: []
  });

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    locations: true,
    skills: true,
    experience: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleFilter = (category: keyof FilterState, value: string) => {
    setFilters(prev => {
      const newFilters = {
        ...prev,
        [category]: prev[category].includes(value)
          ? prev[category].filter(v => v !== value)
          : [...prev[category], value]
      };
      onFilterChange?.(newFilters);
      return newFilters;
    });
  };

  const removeFilter = (category: keyof FilterState, value: string) => {
    toggleFilter(category, value);
  };

  const clearAllFilters = () => {
    const newFilters = {
      locations: [],
      skills: [],
      experience: [],
      companies: []
    };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const hasActiveFilters = filters.locations.length > 0 || filters.skills.length > 0 || filters.experience.length > 0;

  // 已选条件标签
  const renderActiveTags = () => {
    const tags: { category: keyof FilterState; value: string }[] = [];
    filters.locations.forEach(v => tags.push({ category: "locations", value: v }));
    filters.skills.forEach(v => tags.push({ category: "skills", value: v }));
    filters.experience.forEach(v => tags.push({ category: "experience", value: v }));

    if (tags.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-200">
        {tags.map(tag => (
          <span
            key={`${tag.category}-${tag.value}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded-full"
          >
            {tag.value}
            <button
              onClick={() => removeFilter(tag.category, tag.value)}
              className="hover:bg-blue-200 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          onClick={clearAllFilters}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          清除全部
        </button>
      </div>
    );
  };

  return (
    <aside className="w-full lg:w-72 bg-white rounded-2xl border border-slate-200 p-4 h-fit sticky top-24">
      <h2 className="text-lg font-bold text-slate-900 mb-4">筛选条件</h2>

      {/* 已选条件 */}
      {hasActiveFilters && renderActiveTags()}

      {/* 地点筛选 */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection("locations")}
          className="flex items-center justify-between w-full py-2 text-sm font-semibold text-slate-700"
        >
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            地点
          </span>
          <ChevronDown className={clsx("w-4 h-4 transition-transform", expandedSections.locations && "rotate-180")} />
        </button>
        {expandedSections.locations && (
          <div className="flex flex-wrap gap-2 mt-2">
            {LOCATION_OPTIONS.map(location => (
              <button
                key={location}
                onClick={() => toggleFilter("locations", location)}
                className={clsx(
                  "px-3 py-1.5 text-sm rounded-full border transition-all",
                  filters.locations.includes(location)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                )}
              >
                {location}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 技能筛选 */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection("skills")}
          className="flex items-center justify-between w-full py-2 text-sm font-semibold text-slate-700"
        >
          <span className="flex items-center gap-2">
            <Code className="w-4 h-4" />
            技能
          </span>
          <ChevronDown className={clsx("w-4 h-4 transition-transform", expandedSections.skills && "rotate-180")} />
        </button>
        {expandedSections.skills && (
          <div className="flex flex-wrap gap-2 mt-2">
            {SKILL_OPTIONS.map(skill => (
              <button
                key={skill}
                onClick={() => toggleFilter("skills", skill)}
                className={clsx(
                  "px-3 py-1.5 text-sm rounded-full border transition-all",
                  filters.skills.includes(skill)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                )}
              >
                {skill}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 经验筛选 */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection("experience")}
          className="flex items-center justify-between w-full py-2 text-sm font-semibold text-slate-700"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            工作经验
          </span>
          <ChevronDown className={clsx("w-4 h-4 transition-transform", expandedSections.experience && "rotate-180")} />
        </button>
        {expandedSections.experience && (
          <div className="space-y-2 mt-2">
            {EXPERIENCE_OPTIONS.map(exp => (
              <label key={exp} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.experience.includes(exp)}
                  onChange={() => toggleFilter("experience", exp)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">{exp}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}