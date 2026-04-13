import { describe, expect, it, vi, beforeEach } from "vitest";
import { runSocialGraphWorker } from "../social-graph.js";

// Mock @seeku/db
const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => [])
      }))
    })),
    innerJoin: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => [])
      }))
    }))
  }))
}));

vi.mock("@seeku/db", () => ({
  createDatabaseConnection: vi.fn(() => ({
    db: {
      select: selectMock
    },
    close: vi.fn()
  })),
  persons: {},
  sourceProfiles: {},
  personIdentities: {},
  gt: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  eq: vi.fn()
}));

// Mock EnrichmentHub
const processDiscoveryLeadsMock = vi.fn();
const mineGithubNetworkMock = vi.fn();

vi.mock("../enrichment/hub.js", () => ({
  EnrichmentHub: vi.fn().mockImplementation(() => ({
    processDiscoveryLeads: processDiscoveryLeadsMock,
    mineGithubNetwork: mineGithubNetworkMock
  }))
}));

describe("runSocialGraphWorker MiningResult Regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should aggregate discoveryPhase and networkPhase correctly", async () => {
    // Discovery phase: 5 processed, 2 new profiles
    processDiscoveryLeadsMock.mockResolvedValue({ processed: 5, newProfiles: 2 });
    
    // Network mining phase: 10 attempted, 3 new profiles
    mineGithubNetworkMock.mockResolvedValue({ attempted: 10, newProfiles: 3 });

    // Mock DB select for seeds
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => [{ id: "seed-1", name: "test-seed" }])
          }))
        }))
      }))
    } as any);

    // Mock DB select for github handle
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ handle: "test-handle" }])
          }))
        }))
      }))
    } as any);

    const result = await runSocialGraphWorker({ limit: 20 });

    expect(result.discoveryPhase).toEqual({ processed: 5, newProfiles: 2 });
    expect(result.networkPhase).toEqual({ attempted: 10, newProfiles: 3 });
    expect(result.linksProcessed).toBe(15);
    expect(result.newProfilesCreated).toBe(5);
  });
});
