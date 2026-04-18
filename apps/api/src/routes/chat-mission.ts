import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SeekuDatabase } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchWorkflow } from "../../../worker/src/index.js";
import type { AgentSessionBridge } from "./agent-panel.js";

interface ChatMissionStartBody {
  prompt?: unknown;
}

interface ChatMissionRouteOptions {
  bridge?: AgentSessionBridge;
  provider?: LLMProvider;
}

function parseBody(body: unknown): { prompt: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as ChatMissionStartBody;
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  return { prompt };
}

function canRegisterWorkflow(bridge: AgentSessionBridge | undefined): bridge is AgentSessionBridge & {
  registerWorkflow: (workflow: SearchWorkflow) => unknown;
} {
  return Boolean(bridge && "registerWorkflow" in bridge && typeof bridge.registerWorkflow === "function");
}

export function registerChatMissionRoutes(
  server: FastifyInstance,
  db: SeekuDatabase,
  options: ChatMissionRouteOptions = {}
) {
  server.post("/chat-missions", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canRegisterWorkflow(options.bridge)) {
      return reply.status(503).send({
        error: "chat_mission_unavailable"
      });
    }

    let body: { prompt: string };
    try {
      body = parseBody(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const provider = options.provider ?? createProvider();
    const workflow = new SearchWorkflow(db, provider);
    options.bridge.registerWorkflow(workflow);
    await workflow.bootstrapMission(body.prompt);

    return reply.status(202).send({
      sessionId: workflow.getSessionId(),
      snapshot: workflow.getSessionSnapshot()
    });
  });
}
