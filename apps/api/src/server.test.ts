import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApiServer } from "./server.js";
import type { FastifyInstance } from "fastify";
import type { SearchServices } from "./routes/search.js";
import { evidenceItems, persons, searchDocuments } from "@seeku/db";

const mockProvider = {
  name: "mock",
  embed: async () => ({
    embedding: [0.1, 0.2, 0.3],
    model: "mock-embedding",
    dimension: 3
  }),
  chat: async () => ({
    content: "{}",
    model: "mock-chat"
  }),
  embedBatch: async () => []
} as any;

function makePipelineMock(opts: {
  intent?: any;
  results?: any[];
  documents?: Map<string, any>;
  evidence?: Map<string, any[]>;
}) {
  const intent = opts.intent ?? {
    rawQuery: "",
    roles: [],
    skills: [],
    locations: [],
    mustHaves: [],
    niceToHaves: []
  };
  return {
    search: async () => ({
      results: opts.results ?? [],
      intent,
      totalCandidates: (opts.results ?? []).length,
      cachedIntent: false,
      crossEncoderUsed: false,
      documents: opts.documents ?? new Map(),
      evidence: opts.evidence ?? new Map(),
      warnings: []
    })
  } as any;
}

const mockSearchServices: SearchServices = {
  provider: mockProvider,
  pipeline: makePipelineMock({})
};

function createMockSearchDb(results: Map<unknown, unknown[]>) {
  return {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return results.get(table) ?? [];
            }
          };
        }
      };
    }
  } as any;
}

describe("API Server", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildApiServer({ searchServices: mockSearchServices });
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Health Check", () => {
    it("GET /health should return ok", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  describe("Search Endpoint", () => {
    it("POST /search should accept query", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        headers: {
          "Content-Type": "application/json"
        },
        payload: {
          query: "Python developer"
        }
      });

      expect(response.statusCode).toBeLessThan(500);
    });

    it("POST /search should require query field", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        headers: {
          "Content-Type": "application/json"
        },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /search should accept limit parameter", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        headers: {
          "Content-Type": "application/json"
        },
        payload: {
          query: "Python",
          limit: 5
        }
      });

      expect(response.statusCode).toBeLessThan(500);
    });

    it("POST /search should expose matchStrength and resultWarning", async () => {
      const db = createMockSearchDb(new Map<unknown, unknown[]>([
        [searchDocuments, [{
          personId: "person-1",
          docText: "Builder in Hangzhou",
          facetSource: ["bonjour"],
          facetLocation: ["杭州"],
          facetRole: [],
          facetTags: []
        }]],
        [evidenceItems, []],
        [persons, [{
          id: "person-1",
          primaryName: "Ada",
          primaryHeadline: "Builder",
          searchStatus: "active"
        }]]
      ]));

      const searchServices: SearchServices = {
        provider: mockProvider,
        pipeline: makePipelineMock({
          intent: {
            rawQuery: "杭州",
            roles: [],
            skills: [],
            locations: ["杭州"],
            mustHaves: [],
            niceToHaves: []
          },
          results: [{
            personId: "person-1",
            keywordScore: 0,
            vectorScore: 0,
            combinedScore: 0.31,
            matchedText: "Builder in Hangzhou",
            finalScore: 0.31,
            evidenceBoost: 0,
            freshnessPenalty: 1,
            matchReasons: []
          }],
          documents: new Map([["person-1", {
            personId: "person-1",
            docText: "Builder in Hangzhou",
            facetSource: ["bonjour"],
            facetLocation: ["杭州"],
            facetRole: [],
            facetTags: []
          } as any]]),
          evidence: new Map([["person-1", []]])
        })
      };
      const localServer = await buildApiServer({ db, searchServices });

      try {
        const response = await localServer.inject({
          method: "POST",
          url: "/search",
          headers: {
            "Content-Type": "application/json"
          },
          payload: {
            query: "杭州"
          }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          total: 1,
          resultWarning: expect.stringContaining("只找到了弱相关候选人"),
          resultWarningDetail: {
            code: "no_strong_match_weak",
            topMatchStrength: "weak"
          },
          results: [
            {
              personId: "person-1",
              matchStrength: "weak"
            }
          ]
        });
      } finally {
        await localServer.close();
      }
    });

    it("POST /search should classify raw reranker reasons through shared logic", async () => {
      const db = createMockSearchDb(new Map<unknown, unknown[]>([
        [searchDocuments, [{
          personId: "person-1",
          docText: "Python builder in Hangzhou",
          facetSource: ["github"],
          facetLocation: ["杭州"],
          facetRole: [],
          facetTags: []
        }]],
        [evidenceItems, []],
        [persons, [{
          id: "person-1",
          primaryName: "Ada",
          primaryHeadline: "Python Builder",
          searchStatus: "active"
        }]]
      ]));

      const searchServices: SearchServices = {
        provider: mockProvider,
        pipeline: makePipelineMock({
          intent: {
            rawQuery: "python",
            roles: [],
            skills: ["python"],
            locations: [],
            mustHaves: [],
            niceToHaves: []
          },
          results: [{
            personId: "person-1",
            keywordScore: 0,
            vectorScore: 0,
            combinedScore: 0.82,
            matchedText: "Python builder in Hangzhou",
            finalScore: 0.82,
            evidenceBoost: 0,
            freshnessPenalty: 1,
            matchReasons: ["skill evidence: python"]
          }],
          documents: new Map([["person-1", {
            personId: "person-1",
            docText: "Python builder in Hangzhou",
            facetSource: ["github"],
            facetLocation: ["杭州"],
            facetRole: [],
            facetTags: []
          } as any]]),
          evidence: new Map([["person-1", []]])
        })
      };
      const localServer = await buildApiServer({ db, searchServices });

      try {
        const response = await localServer.inject({
          method: "POST",
          url: "/search",
          headers: {
            "Content-Type": "application/json"
          },
          payload: {
            query: "python"
          }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          total: 1,
          results: [
            {
              personId: "person-1",
              matchStrength: "strong"
            }
          ]
        });
      } finally {
        await localServer.close();
      }
    });
  });

  describe("Profiles Endpoint", () => {
    it("GET /profiles/:personId should return 404 for non-existent", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/profiles/00000000-0000-0000-0000-000000000000"
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /profiles/:personId should reject invalid UUID", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/profiles/invalid-uuid"
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("Admin Endpoints", () => {
    it("GET /admin/sync-status should return runs array", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/admin/sync-status"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty("runs");
    });

    it("POST /admin/run-eval should return placeholder", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/admin/run-eval"
      });

      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe("CORS", () => {
    it("should allow cross-origin requests", async () => {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/search",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "POST"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBeDefined();
    });
  });
});
