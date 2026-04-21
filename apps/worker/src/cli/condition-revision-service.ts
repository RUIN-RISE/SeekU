import type { SearchConditions, ScoredCandidate } from "./types.js";
import type { HydratedCandidate } from "./search-executor.js";
import type { AgentSessionState } from "./agent-state.js";
import {
  recordClarification,
  resetRecoveryState,
  setOpenUncertainties
} from "./agent-state.js";

export interface ConditionRevisionServiceDependencies {
  reviseQuery: (args: { currentConditions: SearchConditions; prompt: string; shortlist: any[] }) => Promise<{ conditions: SearchConditions; context: any }>;
  getSessionState: () => AgentSessionState;
  applySessionState: (next: AgentSessionState) => void;
}

export class ConditionRevisionService {
  constructor(private deps: ConditionRevisionServiceDependencies) {}

  async revise(
    current: SearchConditions,
    prompt: string,
    candidates: HydratedCandidate[] = []
  ): Promise<SearchConditions> {
    const revised = await this.deps.reviseQuery({
      currentConditions: current,
      prompt,
      shortlist: candidates
    });
    this.deps.applySessionState(
      setOpenUncertainties(
        resetRecoveryState(
          recordClarification(this.deps.getSessionState(), prompt, revised.conditions)
        ),
        []
      )
    );
    return revised.conditions;
  }
}
