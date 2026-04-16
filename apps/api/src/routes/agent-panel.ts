import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface AgentPanelInterventionCommand {
  type: "add_to_compare" | "remove_from_shortlist" | "expand_evidence" | "apply_feedback";
  candidateId?: string;
  tag?: string;
}

export interface AgentPanelSessionSnapshot {
  sessionId: string;
  status: string;
  statusSummary: string | null;
  [key: string]: unknown;
}

export interface AgentPanelSessionEvent {
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: string;
  status: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface AgentPanelInterventionResult {
  ok: boolean;
  command: AgentPanelInterventionCommand;
  summary: string;
  snapshot: AgentPanelSessionSnapshot;
  reason?: string;
}

export interface AgentSessionBridge {
  hasSession(sessionId: string): boolean;
  getSnapshot(sessionId: string): AgentPanelSessionSnapshot | null;
  subscribe(
    sessionId: string,
    listener: (event: AgentPanelSessionEvent) => void
  ): (() => void) | null;
  applyIntervention(
    sessionId: string,
    command: AgentPanelInterventionCommand
  ): Promise<AgentPanelInterventionResult | null>;
}

interface AgentPanelRouteOptions {
  bridge?: AgentSessionBridge;
}

interface InterventionBody {
  type?: unknown;
  candidateId?: unknown;
  tag?: unknown;
}

function formatSSE(event: { event: string; data: unknown }): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function parseIntervention(body: unknown): AgentPanelInterventionCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as InterventionBody;
  if (typeof value.type !== "string" || !value.type.trim()) {
    throw new Error("type is required.");
  }

  const command: AgentPanelInterventionCommand = {
    type: value.type.trim() as AgentPanelInterventionCommand["type"]
  };

  if (typeof value.candidateId === "string" && value.candidateId.trim()) {
    command.candidateId = value.candidateId.trim();
  }

  if (typeof value.tag === "string" && value.tag.trim()) {
    command.tag = value.tag.trim();
  }

  return command;
}

function sendUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "agent_panel_unavailable"
  });
}

export function registerAgentPanelRoutes(
  server: FastifyInstance,
  options: AgentPanelRouteOptions = {}
) {
  server.get<{ Params: { sessionId: string }; Querystring: { once?: string } }>("/agent-panel/:sessionId/events", async (request, reply) => {
    if (!options.bridge) {
      return sendUnavailable(reply);
    }

    const { sessionId } = request.params;
    const closeAfterSnapshot = request.query.once === "1";
    const snapshot = options.bridge.getSnapshot(sessionId);
    if (!snapshot) {
      return reply.status(404).send({
        error: "session_not_found"
      });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    reply.raw.write(formatSSE({
      event: "snapshot",
      data: snapshot
    }));

    if (closeAfterSnapshot) {
      reply.raw.end();
      return reply;
    }

    const unsubscribe = options.bridge.subscribe(sessionId, (event: AgentPanelSessionEvent) => {
      reply.raw.write(formatSSE({
        event: event.type,
        data: event
      }));
    });

    request.raw.on("close", () => {
      unsubscribe?.();
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    });

    return reply;
  });

  server.post<{ Params: { sessionId: string } }>("/agent-panel/:sessionId/interventions", async (request, reply) => {
    if (!options.bridge) {
      return sendUnavailable(reply);
    }

    const { sessionId } = request.params;
    let command: AgentPanelInterventionCommand;
    try {
      command = parseIntervention(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const result = await options.bridge.applyIntervention(sessionId, command);
    if (!result) {
      return reply.status(404).send({
        error: "session_not_found"
      });
    }

    if (!result.ok) {
      return reply.status(409).send({
        error: "intervention_rejected",
        reason: result.reason,
        summary: result.summary,
        snapshot: result.snapshot
      });
    }

    return reply.status(202).send({
      ok: true,
      summary: result.summary,
      snapshot: result.snapshot
    });
  });
}
