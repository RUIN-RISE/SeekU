import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealFlowBoard } from "../DealFlowBoard.js";
import type { DealFlowResponse } from "@/lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem(key: string) {
      return store[key] ?? null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    }
  };
})();

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("crypto", {
  randomUUID: () => "viewer-1"
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function createDealFlowResponse(): DealFlowResponse {
  return {
    artifact: {
      generatedForDate: "2026-04-17",
      generatedAt: "2026-04-17T08:00:00.000Z",
      totalCandidates: 1,
      bucketCounts: {
        new: 1,
        "high-confidence": 0,
        "needs-validation": 0,
        revisit: 0
      },
      topToday: [
        {
          personId: "person-1",
          name: "Ada",
          headline: "Agent infra lead",
          bucket: "new",
          confidence: "high",
          totalScore: 0.81,
          whyMatched: "Shared direction around AI agents.",
          whyNow: "This is one of the strongest direction matches in today's pool.",
          approachPath: "Lead with the open-source work.",
          directionSummary: "AI agents / AI infra",
          directionTags: ["ai_agents", "ai_infra"],
          overlapTags: ["ai_agents"],
          sourceBadges: ["github"],
          evidencePreview: [
            {
              id: "e1",
              type: "repository",
              title: "runtime-agent",
              description: "Ships agent infra in production.",
              url: "https://example.com/e1"
            }
          ],
          state: {
            seenCount: 1,
            detailViewCount: 0,
            repeatViewCount: 0,
            lastFeedbackKind: null
          }
        }
      ],
      moreOpportunities: []
    },
    goalModel: {
      explicitGoal: "Find AI agents builders",
      summary: "Current goal centers on AI agents.",
      driftStatus: "aligned",
      dominantDirectionTags: ["ai_agents"],
      signalSources: ["explicit_goal"]
    },
    viewer: {
      viewerId: "viewer-1",
      feedbackCounts: {
        interested: 0,
        not_interested: 0,
        contacted: 0,
        revisit: 0
      },
      interactionCounts: {
        detail_view: 0,
        repeat_view: 0,
        evidence_expand: 0,
        dwell: 0
      },
      surfacedCandidates: 1
    }
  };
}

describe("DealFlowBoard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorageMock.clear();
    localStorage.setItem("seeku_deal_flow_viewer", "viewer-1");
    localStorage.setItem("seeku_deal_flow_goal", "Find AI agents builders");
  });

  it("renders the daily deal flow and tracks detail expansion", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createDealFlowResponse()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      });

    render(React.createElement(DealFlowBoard));

    await waitFor(() => {
      expect(screen.getByText("Ada")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("打开档案摘要"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/deal-flow/interactions"),
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    expect(screen.getByText("打开完整档案")).toBeTruthy();
  });

  it("submits feedback and refreshes the board", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createDealFlowResponse()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...createDealFlowResponse(),
          viewer: {
            ...createDealFlowResponse().viewer,
            feedbackCounts: {
              interested: 1,
              not_interested: 0,
              contacted: 0,
              revisit: 0
            }
          }
        })
      });

    render(React.createElement(DealFlowBoard));

    await waitFor(() => {
      expect(screen.getByText("Ada")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText("感兴趣")[1]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/deal-flow/feedback"),
        expect.objectContaining({
          method: "POST"
        })
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
