import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApiServer } from "./server.js";
import type { FastifyInstance } from "fastify";
import type { SearchServices } from "./routes/search.js";

const mockSearchServices: SearchServices = {
  provider: {
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
  } as any,
  planner: {
    parse: async (query: string) => ({
      rawQuery: query,
      roles: [],
      skills: [],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    })
  } as any,
  retriever: {
    retrieve: async () => []
  } as any,
  reranker: {
    rerank: () => []
  } as any
};

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

      // Should not return 500 error
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

      // Should return 400 for missing query
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

      // Should return 501 Not Implemented or success
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
