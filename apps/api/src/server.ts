import "dotenv/config";

import Fastify from "fastify";

import {
  createDatabaseConnection,
  createOptOutRequest,
  getOptOutRequest,
  processOptOutRequest,
  serializeOptOutRequest,
  type SeekuDatabase
} from "@seeku/db";
import { OptOutRequestInputSchema, type SourceName } from "@seeku/shared";

function inferSourceAndHandle(input: {
  source?: SourceName;
  sourceHandle?: string;
  profileUrl?: string;
}) {
  if (input.source && input.sourceHandle) {
    return {
      source: input.source,
      sourceHandle: input.sourceHandle
    };
  }

  if (!input.profileUrl) {
    return {
      source: input.source,
      sourceHandle: input.sourceHandle
    };
  }

  const url = new URL(input.profileUrl);
  const sourceHandle = url.pathname.replace(/^\/+/, "").split("/")[0];

  if (url.hostname === "bonjour.bio" || url.hostname.endsWith(".bonjour.bio")) {
    return {
      source: "bonjour" as const,
      sourceHandle
    };
  }

  return {
    source: input.source,
    sourceHandle: input.sourceHandle ?? sourceHandle
  };
}

export function buildApiServer(db?: SeekuDatabase) {
  const fastify = Fastify({
    logger: true
  });

  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  fastify.get("/health", async () => ({
    status: "ok"
  }));

  fastify.post("/opt-out-requests", async (request, reply) => {
    const parsed = OptOutRequestInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        issues: parsed.error.flatten()
      });
    }

    const resolved = inferSourceAndHandle(parsed.data);
    const created = await createOptOutRequest(database, {
      source: resolved.source,
      sourceHandle: resolved.sourceHandle,
      requesterContact: parsed.data.requesterContact,
      reason: parsed.data.reason
    });

    let processed: Awaited<ReturnType<typeof processOptOutRequest>> | null = null;

    if (parsed.data.processNow !== false) {
      processed = await processOptOutRequest(database, created.id);
    }

    return reply.status(201).send({
      request: serializeOptOutRequest(processed?.request ?? created),
      hiddenProfiles: processed?.hiddenProfiles ?? []
    });
  });

  fastify.get("/opt-out-requests/:id", async (request, reply) => {
    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.status(400).send({
        error: "missing_id"
      });
    }

    const item = await getOptOutRequest(database, params.id);

    if (!item) {
      return reply.status(404).send({
        error: "not_found"
      });
    }

    return {
      request: serializeOptOutRequest(item)
    };
  });

  fastify.post("/opt-out-requests/:id/process", async (request, reply) => {
    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.status(400).send({
        error: "missing_id"
      });
    }

    const processed = await processOptOutRequest(database, params.id);

    return reply.send({
      request: serializeOptOutRequest(processed.request),
      hiddenProfiles: processed.hiddenProfiles
    });
  });

  fastify.addHook("onClose", async () => {
    await ownedConnection?.close();
  });

  return fastify;
}

async function main() {
  const server = buildApiServer();
  const port = Number(process.env.API_PORT ?? "3001");
  await server.listen({
    host: "0.0.0.0",
    port
  });
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
