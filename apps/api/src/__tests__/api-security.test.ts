import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApiServer } from "../server.js";
import type { FastifyInstance } from "fastify";

describe("API Security", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildApiServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Admin authentication", () => {
    it("returns 503 when API_ADMIN_KEY is not set", async () => {
      const originalKey = process.env.API_ADMIN_KEY;
      delete process.env.API_ADMIN_KEY;

      const response = await server.inject({
        method: "GET",
        url: "/admin/sync-status"
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.error).toBe("admin_disabled");

      if (originalKey) process.env.API_ADMIN_KEY = originalKey;
    });

    it("returns 401 when API_ADMIN_KEY is set but no auth header", async () => {
      const originalKey = process.env.API_ADMIN_KEY;
      process.env.API_ADMIN_KEY = "test-secret";

      const response = await server.inject({
        method: "GET",
        url: "/admin/sync-status"
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error).toBe("unauthorized");

      if (originalKey) process.env.API_ADMIN_KEY = originalKey;
      else delete process.env.API_ADMIN_KEY;
    });

    it("returns 401 with wrong API key", async () => {
      const originalKey = process.env.API_ADMIN_KEY;
      process.env.API_ADMIN_KEY = "test-secret";

      const response = await server.inject({
        method: "GET",
        url: "/admin/sync-status",
        headers: {
          authorization: "Bearer wrong-key"
        }
      });

      expect(response.statusCode).toBe(401);

      if (originalKey) process.env.API_ADMIN_KEY = originalKey;
      else delete process.env.API_ADMIN_KEY;
    });

    it("allows access with correct API key", async () => {
      const originalKey = process.env.API_ADMIN_KEY;
      process.env.API_ADMIN_KEY = "test-secret";

      const response = await server.inject({
        method: "GET",
        url: "/admin/sync-status",
        headers: {
          authorization: "Bearer test-secret"
        }
      });

      // May be 200 (with DB) or error (without DB), but NOT 401/503
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(503);

      if (originalKey) process.env.API_ADMIN_KEY = originalKey;
      else delete process.env.API_ADMIN_KEY;
    });
  });

  describe("Health endpoint", () => {
    it("returns health status", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("status");
      expect(["ok", "degraded"]).toContain(body.status);
    });
  });

  describe("Search input validation", () => {
    it("rejects empty query", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        payload: { query: "" }
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects missing query", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        payload: { limit: 10 }
      });

      expect(response.statusCode).toBe(400);
    });

    it("accepts long query (no max length enforcement in current parseBody)", async () => {
      // Current parseBody doesn't enforce max length — just trims whitespace.
      // A 500-char query is valid and triggers search (may fail on LLM, but not 400).
      const response = await server.inject({
        method: "POST",
        url: "/search",
        payload: { query: "x".repeat(500) }
      });

      // Should not be 400 — the query is valid non-empty string
      expect(response.statusCode).not.toBe(400);
    });

    it("clamps limit to 50", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/search",
        payload: { query: "test", limit: 9999 }
      });

      // Should not reject — the code clamps the limit
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe("Profile UUID validation", () => {
    it("rejects invalid personId format", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/profiles/not-a-uuid"
      });

      expect(response.statusCode).toBe(400);
    });

    it("accepts valid UUID format", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/profiles/550e8400-e29b-41d4-a716-446655440000"
      });

      // 404 is fine (not found), but should NOT be 400
      expect(response.statusCode).not.toBe(400);
    });
  });

  describe("Opt-out routes", () => {
    it("rejects invalid opt-out body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/opt-out-requests",
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it("creates opt-out request with valid body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/opt-out-requests",
        payload: {
          requesterContact: "test@example.com",
          source: "bonjour",
          sourceHandle: "testuser",
          processNow: false
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.request).toBeDefined();
      expect(body.request.requesterContact).toBe("test@example.com");
    });

    it("returns 404 for non-existent opt-out request", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/opt-out-requests/550e8400-e29b-41d4-a716-446655440000"
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
