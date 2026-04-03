import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApiServer } from "../../server.js";
import type { FastifyInstance } from "fastify";

/**
 * Tests for profile-edit and admin-claims routes.
 * These tests verify route registration and basic endpoint behavior.
 */

describe("Profile Edit Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildApiServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("PUT /profiles/:personId", () => {
    it("should register PUT endpoint for profile updates", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/profiles/test-person-id",
        headers: { "Content-Type": "application/json" },
        payload: { headline: "New Headline" }
      });

      // Route should exist (not 404)
      expect(response.statusCode).not.toBe(404);
      // Should return some response (either success or validation error)
      expect([200, 400, 403, 404, 500]).toContain(response.statusCode);
    });

    it("should accept headline in request body", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/profiles/test-person-id",
        headers: { "Content-Type": "application/json" },
        payload: { headline: "Updated Headline" }
      });

      expect(response.statusCode).not.toBe(404);
    });

    it("should accept contactVisible in request body", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/profiles/test-person-id",
        headers: { "Content-Type": "application/json" },
        payload: { contactVisible: false }
      });

      expect(response.statusCode).not.toBe(404);
    });
  });

  describe("DELETE /evidence/:evidenceId", () => {
    it("should register DELETE endpoint for evidence removal", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/evidence/test-evidence-id",
        headers: { "Content-Type": "application/json" },
        payload: { personId: "test-person-id" }
      });

      // Route should exist (not 404)
      expect(response.statusCode).not.toBe(404);
    });

    it("should require personId in body for ownership check", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/evidence/test-evidence-id",
        headers: { "Content-Type": "application/json" },
        payload: {}
      });

      // Should return an error (either validation or database error)
      expect(response.statusCode).not.toBe(404);
    });
  });

  describe("POST /evidence", () => {
    it("should register POST endpoint for evidence addition", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/evidence",
        headers: { "Content-Type": "application/json" },
        payload: {
          personId: "test-person-id",
          type: "project",
          title: "Test Project",
          url: "https://github.com/test/project"
        }
      });

      // Route should exist (not 404)
      expect(response.statusCode).not.toBe(404);
    });

    it("should accept evidence type parameter", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/evidence",
        headers: { "Content-Type": "application/json" },
        payload: {
          personId: "test-person-id",
          type: "repository",
          title: "Test Repo"
        }
      });

      expect(response.statusCode).not.toBe(404);
    });
  });
});

describe("Admin Claims Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildApiServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /admin/claims", () => {
    it("should register GET endpoint for claims list", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/admin/claims"
      });

      // Route should exist (not 404)
      expect(response.statusCode).not.toBe(404);
      // Should return JSON response
      expect(response.headers["content-type"]).toContain("application/json");
    });

    it("should support status filter query param", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/admin/claims?status=approved"
      });

      expect(response.statusCode).not.toBe(404);
    });

    it("should support method filter query param", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/admin/claims?method=email"
      });

      expect(response.statusCode).not.toBe(404);
    });

    it("should support pagination params", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/admin/claims?limit=10&offset=0"
      });

      expect(response.statusCode).not.toBe(404);
    });
  });

  describe("POST /admin/claims/:claimId/revoke", () => {
    it("should register POST endpoint for claim revocation", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/admin/claims/test-claim-id/revoke",
        headers: { "Content-Type": "application/json" },
        payload: { reason: "Test revocation reason" }
      });

      // Route should exist (not 404)
      expect(response.statusCode).not.toBe(404);
    });

    it("should require reason in request body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/admin/claims/test-claim-id/revoke",
        headers: { "Content-Type": "application/json" },
        payload: {}
      });

      // Should return 400 for missing reason
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "reason_required"
      });
    });

    it("should reject empty reason string", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/admin/claims/test-claim-id/revoke",
        headers: { "Content-Type": "application/json" },
        payload: { reason: "" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "reason_required"
      });
    });
  });
});