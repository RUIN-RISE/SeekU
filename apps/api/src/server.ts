import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";

import {
  createDatabaseConnection,
  createOptOutRequest,
  getOptOutRequest,
  processOptOutRequest,
  serializeOptOutRequest,
  type SeekuDatabase
} from "@seeku/db";
import { OptOutRequestInputSchema, type SourceName } from "@seeku/shared";

import { registerSearchRoutes } from "./routes/search.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerAdminRoutes } from "./routes/admin.js";
import type { SearchServices } from "./routes/search.js";

interface BuildApiServerOptions {
  db?: SeekuDatabase;
  searchServices?: SearchServices;
}

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

  let url: URL;
  try {
    url = new URL(input.profileUrl);
  } catch {
    return {
      source: input.source,
      sourceHandle: input.sourceHandle
    };
  }

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

function resolveBuildOptions(input?: SeekuDatabase | BuildApiServerOptions): BuildApiServerOptions {
  if (!input) {
    return {};
  }

  if ("select" in input) {
    return { db: input };
  }

  return input;
}

export async function buildApiServer(input?: SeekuDatabase | BuildApiServerOptions) {
  const options = resolveBuildOptions(input);
  const fastify = Fastify({
    logger: true
  });

  await fastify.register(cors, {
    origin: true
  });

  const ownedConnection = options.db ? null : createDatabaseConnection();
  const database = options.db ?? ownedConnection!.db;

  fastify.get("/health", async () => ({
    status: "ok"
  }));

  registerSearchRoutes(fastify, database, { services: options.searchServices });
  registerProfileRoutes(fastify, database);
  registerAdminRoutes(fastify, database);

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
  const server = await buildApiServer();
  const port = Number(process.env.API_PORT ?? "3000");
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
