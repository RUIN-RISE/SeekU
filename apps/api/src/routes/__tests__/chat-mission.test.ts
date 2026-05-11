import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../../server.js";
import { InMemoryAgentSessionBridge } from "../../../../worker/src/index.js";
import type { AgentSessionBridge } from "../agent-panel.js";

describe("Chat mission routes", () => {
  let server: FastifyInstance | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it.skip("starts a runtime-backed chat mission and returns session snapshot", async () => {
    server = await buildApiServer({
      db: {} as any,
      agentSessionBridge: new InMemoryAgentSessionBridge() as unknown as AgentSessionBridge
    });

    const response = await server.inject({
      method: "POST",
      url: "/chat-missions",
      payload: {
        prompt: "找上海的 AI 工程师"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      sessionId: expect.any(String),
      snapshot: {
        sessionId: expect.any(String),
        runtime: {
          status: expect.any(String)
        }
      }
    });
  });

  it("rejects invalid payloads for chat mission start", async () => {
    server = await buildApiServer({
      db: {} as any,
      agentSessionBridge: new InMemoryAgentSessionBridge() as unknown as AgentSessionBridge
    });

    const response = await server.inject({
      method: "POST",
      url: "/chat-missions",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_request"
    });
  });
});
