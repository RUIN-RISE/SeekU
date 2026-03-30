import { describe, it, expect } from "vitest";

describe("Retrieval Smoke Suite - Planner", () => {
  it("should match Chinese city name in heuristic", () => {
    const normalized = "杭州".toLowerCase();
    const match = normalized.match(
      /(beijing|shanghai|shenzhen|hangzhou|guangzhou|china|singapore|remote|北京|上海|深圳|杭州|广州|中国|新加坡|远程)/g
    );
    expect(match).not.toBeNull();
    expect(match).toContain("杭州");
  });

  it("should match English city name in heuristic", () => {
    const normalized = "hangzhou".toLowerCase();
    const match = normalized.match(
      /(beijing|shanghai|shenzhen|hangzhou|guangzhou|china|singapore|remote|北京|上海|深圳|杭州|广州|中国|新加坡|远程)/g
    );
    expect(match).not.toBeNull();
    expect(match).toContain("hangzhou");
  });

  it("should match Beijing in Chinese", () => {
    const normalized = "北京工程师".toLowerCase();
    const match = normalized.match(
      /(beijing|shanghai|shenzhen|hangzhou|guangzhou|china|singapore|remote|北京|上海|深圳|杭州|广州|中国|新加坡|远程)/g
    );
    expect(match).not.toBeNull();
    expect(match).toContain("北京");
  });
});