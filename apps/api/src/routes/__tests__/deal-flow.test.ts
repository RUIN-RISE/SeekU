import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { EvidenceItem, Person, SearchDocument } from "@seeku/db";

import { buildApiServer } from "../../server.js";
import {
  createDealFlowCandidate,
  createMemoryDealFlowStateStore,
  type DealFlowStateStore
} from "../deal-flow.js";

function createMockDb() {
  return {
    execute: async () => [{ ok: 1 }],
    select() {
      return {
        from() {
          return {
            where() {
              return [];
            },
            orderBy() {
              return {
                limit() {
                  return [];
                }
              };
            }
          };
        }
      };
    }
  } as any;
}

function buildPerson(id: string, name: string, headline: string): Person {
  return {
    id,
    primaryName: name,
    primaryHeadline: headline,
    summary: `${headline} focused on AI agents and developer tooling.`,
    primaryLocation: "Hangzhou",
    avatarUrl: null,
    searchStatus: "active",
    confidenceScore: "0.91",
    createdAt: new Date("2026-04-16T00:00:00.000Z"),
    updatedAt: new Date("2026-04-16T00:00:00.000Z")
  };
}

function buildDocument(personId: string, tags: string[], sources: string[]): SearchDocument {
  return {
    personId,
    docText: "AI agents, developer tools, open source builder",
    facetRole: ["builder"],
    facetLocation: ["hangzhou"],
    facetSource: sources,
    facetTags: tags,
    rankFeatures: {
      evidenceCount: 4,
      projectCount: 2,
      repoCount: 2,
      followerCount: 0,
      freshness: 12
    },
    updatedAt: new Date("2026-04-16T00:00:00.000Z")
  };
}

function buildEvidence(personId: string, id: string, title: string): EvidenceItem {
  return {
    id,
    personId,
    sourceProfileId: null,
    source: "github",
    evidenceType: "repository",
    title,
    description: `${title} ships agent infra in production.`,
    url: `https://example.com/${id}`,
    occurredAt: new Date("2026-04-14T00:00:00.000Z"),
    metadata: {},
    evidenceHash: `hash-${id}`,
    createdAt: new Date("2026-04-14T00:00:00.000Z")
  };
}

function createServer(store: DealFlowStateStore) {
  const ada = buildPerson("person-1", "Ada", "Agent infra lead");
  const lin = buildPerson("person-2", "Lin", "Developer tools founder");

  return buildApiServer({
    db: createMockDb(),
    dealFlowServices: {
      store,
      now: () => new Date("2026-04-17T08:00:00.000Z"),
      loadCandidates: async ({ viewerId, now }) => [
        createDealFlowCandidate({
          person: ada,
          document: buildDocument(ada.id, ["direction:ai_agents", "direction:ai_infra"], ["github"]),
          evidence: [buildEvidence(ada.id, "e1", "runtime-agent")],
          state: store.buildCandidateState(viewerId, ada.id, now)
        }),
        createDealFlowCandidate({
          person: lin,
          document: buildDocument(lin.id, ["direction:developer_tools", "direction:open_source"], ["bonjour"]),
          evidence: [buildEvidence(lin.id, "e2", "builder-toolkit")],
          state: store.buildCandidateState(viewerId, lin.id, now)
        })
      ]
    }
  });
}

describe("Deal flow routes", () => {
  let server: FastifyInstance | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("returns a curated daily deal flow artifact", async () => {
    server = await createServer(createMemoryDealFlowStateStore());

    const response = await server.inject({
      method: "GET",
      url: "/deal-flow?viewerId=tester&goal=Looking%20for%20AI%20agents%20builders"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toMatchObject({
      artifact: {
        totalCandidates: 2
      },
      goalModel: {
        explicitGoal: "Looking for AI agents builders"
      },
      viewer: {
        viewerId: "tester",
        surfacedCandidates: 2
      }
    });
    expect(payload.artifact.topToday).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: expect.any(String),
          name: expect.any(String)
        })
      ])
    );
  });

  it("records feedback and exposes it on the next retrieval", async () => {
    const store = createMemoryDealFlowStateStore();
    server = await createServer(store);

    const feedbackResponse = await server.inject({
      method: "POST",
      url: "/deal-flow/feedback",
      payload: {
        viewerId: "tester",
        personId: "person-2",
        kind: "interested",
        directionTags: ["developer_tools", "open_source"]
      }
    });

    expect(feedbackResponse.statusCode).toBe(200);
    expect(feedbackResponse.json()).toMatchObject({
      ok: true,
      viewer: {
        feedbackCounts: {
          interested: 1
        }
      }
    });

    const retrieval = await server.inject({
      method: "GET",
      url: "/deal-flow?viewerId=tester&goal=Looking%20for%20developer%20tools"
    });

    expect(retrieval.statusCode).toBe(200);
    expect(retrieval.json()).toMatchObject({
      viewer: {
        feedbackCounts: {
          interested: 1
        }
      }
    });
    expect(retrieval.json().artifact.topToday).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: "person-2",
          state: expect.objectContaining({
            lastFeedbackKind: "interested"
          })
        })
      ])
    );
  });

  it("lets explicit feedback remove weak-fit candidates from the next list", async () => {
    server = await createServer(createMemoryDealFlowStateStore());

    const feedbackResponse = await server.inject({
      method: "POST",
      url: "/deal-flow/feedback",
      payload: {
        viewerId: "tester",
        personId: "person-1",
        kind: "not_interested",
        directionTags: ["ai_agents"]
      }
    });

    expect(feedbackResponse.statusCode).toBe(200);

    const retrieval = await server.inject({
      method: "GET",
      url: "/deal-flow?viewerId=tester&goal=Looking%20for%20AI%20agents%20builders"
    });

    expect(retrieval.statusCode).toBe(200);
    expect(retrieval.json().artifact.topToday).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: "person-1"
        })
      ])
    );
  });

  it("records implicit interaction events", async () => {
    server = await createServer(createMemoryDealFlowStateStore());

    const response = await server.inject({
      method: "POST",
      url: "/deal-flow/interactions",
      payload: {
        viewerId: "tester",
        personId: "person-1",
        kind: "evidence_expand",
        directionTags: ["ai_agents"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      viewer: {
        interactionCounts: {
          evidence_expand: 1
        }
      }
    });
  });

  it("emits a drift note when recent interactions diverge from the explicit goal", async () => {
    server = await createServer(createMemoryDealFlowStateStore());

    const interactionResponse = await server.inject({
      method: "POST",
      url: "/deal-flow/interactions",
      payload: {
        viewerId: "tester",
        personId: "person-1",
        kind: "detail_view",
        directionTags: ["fintech"]
      }
    });

    expect(interactionResponse.statusCode).toBe(200);

    const retrieval = await server.inject({
      method: "GET",
      url: "/deal-flow?viewerId=tester&goal=Looking%20for%20AI%20agents%20builders"
    });

    expect(retrieval.statusCode).toBe(200);
    expect(retrieval.json()).toMatchObject({
      goalModel: {
        driftStatus: "shifting"
      },
      driftNote: expect.stringContaining("starting to lean away")
    });
  });
});
