"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGENT_PANEL_EVENT_TYPES,
  applyAgentPanelEvent,
  applyAgentPanelSnapshot,
  createInitialAgentPanelState,
  findExpandedCandidate,
  formatAgentPanelError,
  getInterventionCommandKey,
  parseSnapshotEventBody,
  type AgentPanelConnectionStatus,
  type AgentPanelInterventionApiResponse,
  type AgentPanelInterventionCommand,
  type AgentPanelNotice,
  type AgentPanelSessionEvent,
  type AgentPanelSessionSnapshot,
  type AgentPanelState
} from "@/lib/agent-panel";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const RECONNECT_DELAY_MS = 2_000;

export interface UseAgentPanelSessionResult {
  snapshot: AgentPanelSessionSnapshot | null;
  events: AgentPanelSessionEvent[];
  connectionStatus: AgentPanelConnectionStatus;
  expandedCandidate: ReturnType<typeof findExpandedCandidate>;
  latestNotice: AgentPanelNotice | null;
  errorMessage: string | null;
  pendingCommandKey: string | null;
  sendIntervention: (command: AgentPanelInterventionCommand) => Promise<void>;
  retryConnection: () => void;
  isCommandPending: (command: AgentPanelInterventionCommand) => boolean;
}

function buildEventsUrl(sessionId: string, once = false): string {
  const encodedSessionId = encodeURIComponent(sessionId);
  return `${API_BASE_URL}/agent-panel/${encodedSessionId}/events${once ? "?once=1" : ""}`;
}

function buildInterventionUrl(sessionId: string): string {
  return `${API_BASE_URL}/agent-panel/${encodeURIComponent(sessionId)}/interventions`;
}

function createSyntheticInterventionEvent(
  sessionId: string,
  sequence: number,
  command: AgentPanelInterventionCommand,
  status: AgentPanelSessionSnapshot["status"],
  summary: string,
  data: Record<string, unknown>,
  type: "intervention_applied" | "intervention_rejected"
): AgentPanelSessionEvent {
  return {
    sessionId,
    sequence,
    timestamp: new Date().toISOString(),
    type,
    status,
    summary,
    data
  };
}

export function useAgentPanelSession(sessionId: string): UseAgentPanelSessionResult {
  const [state, setState] = useState<AgentPanelState>(() => createInitialAgentPanelState(sessionId));
  const [pendingCommandKey, setPendingCommandKey] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setState(createInitialAgentPanelState(sessionId));
    setPendingCommandKey(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId.trim()) {
      setState((previousState) => ({
        ...previousState,
        connectionStatus: "error",
        errorMessage: "缺少 sessionId，无法连接面板。"
      }));
      return;
    }

    let closed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeEventSource = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) {
        return;
      }

      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      closeEventSource();
      clearReconnectTimer();

      setState((previousState) => ({
        ...previousState,
        connectionStatus: previousState.snapshot ? "reconnecting" : "connecting",
        errorMessage: null
      }));

      try {
        const response = await fetch(buildEventsUrl(sessionId, true), {
          cache: "no-store"
        });

        if (closed) {
          return;
        }

        if (response.status === 404) {
          setState((previousState) => ({
            ...previousState,
            connectionStatus: "missing",
            errorMessage: "当前 session 不存在，先在 CLI 中启动一次可见 agent 会话。"
          }));
          return;
        }

        if (!response.ok) {
          throw new Error(`snapshot_request_failed:${response.status}`);
        }

        const snapshot = parseSnapshotEventBody(await response.text());
        if (closed) {
          return;
        }

        setState((previousState) =>
          applyAgentPanelSnapshot(previousState, snapshot, {
            connectionStatus: previousState.snapshot ? "reconnecting" : "connecting",
            errorMessage: null
          })
        );
      } catch (error) {
        if (closed) {
          return;
        }

        setState((previousState) => ({
          ...previousState,
          connectionStatus: previousState.snapshot ? "disconnected" : "error",
          errorMessage: formatAgentPanelError(error)
        }));
        scheduleReconnect();
        return;
      }

      try {
        eventSource = new EventSource(buildEventsUrl(sessionId));
      } catch (error) {
        if (closed) {
          return;
        }

        setState((previousState) => ({
          ...previousState,
          connectionStatus: "disconnected",
          errorMessage: formatAgentPanelError(error)
        }));
        scheduleReconnect();
        return;
      }

      const bindEvent = (
        eventName: string,
        handler: (event: MessageEvent<string>) => void
      ) => {
        eventSource?.addEventListener(eventName, handler as EventListener);
      };

      bindEvent("snapshot", (rawEvent) => {
        if (closed) {
          return;
        }

        const snapshot = JSON.parse(rawEvent.data) as AgentPanelSessionSnapshot;
        setState((previousState) =>
          applyAgentPanelSnapshot(previousState, snapshot, {
            connectionStatus: "live",
            errorMessage: null
          })
        );
      });

      for (const eventType of AGENT_PANEL_EVENT_TYPES) {
        bindEvent(eventType, (rawEvent) => {
          if (closed) {
            return;
          }

          const nextEvent = JSON.parse(rawEvent.data) as AgentPanelSessionEvent;
          setState((previousState) => ({
            ...applyAgentPanelEvent(previousState, nextEvent),
            connectionStatus: "live",
            errorMessage: null
          }));
        });
      }

      eventSource.onerror = () => {
        closeEventSource();
        if (closed) {
          return;
        }

        setState((previousState) => ({
          ...previousState,
          connectionStatus: previousState.snapshot ? "disconnected" : "error",
          errorMessage: "实时事件流已断开，正在尝试重连。"
        }));
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      closeEventSource();
    };
  }, [retryNonce, sessionId]);

  const sendIntervention = useCallback(async (command: AgentPanelInterventionCommand) => {
    const commandKey = getInterventionCommandKey(command);
    setPendingCommandKey(commandKey);

    try {
      const response = await fetch(buildInterventionUrl(sessionId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      });
      const payload = await response.json() as AgentPanelInterventionApiResponse;

      if (response.status === 404) {
        setState((previousState) => ({
          ...previousState,
          connectionStatus: "missing",
          latestNotice: {
            kind: "error",
            message: "当前 session 已不存在。"
          },
          errorMessage: "当前 session 已不存在。"
        }));
        return;
      }

      if (response.status === 409) {
        setState((previousState) => {
          const nextState = payload.snapshot
            ? applyAgentPanelSnapshot(previousState, payload.snapshot)
            : previousState;
          const nextSequence = (nextState.events.at(-1)?.sequence ?? 0) + 1;
          const nextEvent = createSyntheticInterventionEvent(
            sessionId,
            nextSequence,
            command,
            payload.snapshot?.status ?? nextState.snapshot?.status ?? "waiting-input",
            payload.summary ?? "这次干预被 runtime 拒绝了。",
            {
              command,
              reason: payload.reason
            },
            "intervention_rejected"
          );

          return {
            ...applyAgentPanelEvent(nextState, nextEvent),
            latestNotice: {
              kind: "error",
              message: payload.summary ?? "这次干预被 runtime 拒绝了。"
            }
          };
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`intervention_failed:${response.status}`);
      }

      setState((previousState) => {
        const nextState = payload.snapshot
          ? applyAgentPanelSnapshot(previousState, payload.snapshot)
          : previousState;
        const nextSequence = (nextState.events.at(-1)?.sequence ?? 0) + 1;
        const nextEvent = createSyntheticInterventionEvent(
          sessionId,
          nextSequence,
          command,
          payload.snapshot?.status ?? nextState.snapshot?.status ?? "waiting-input",
          payload.summary ?? "干预命令已提交。",
          {
            command
          },
          "intervention_applied"
        );

        return {
          ...applyAgentPanelEvent(nextState, nextEvent),
          latestNotice: {
            kind: "success",
            message: payload.summary ?? "干预命令已提交。"
          }
        };
      });
    } catch (error) {
      setState((previousState) => ({
        ...previousState,
        latestNotice: {
          kind: "error",
          message: formatAgentPanelError(error)
        }
      }));
    } finally {
      setPendingCommandKey(null);
    }
  }, [sessionId]);

  const retryConnection = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  const expandedCandidate = useMemo(
    () => findExpandedCandidate(state.snapshot, state.expandedCandidateId),
    [state.expandedCandidateId, state.snapshot]
  );

  const isCommandPending = useCallback((command: AgentPanelInterventionCommand) => {
    return pendingCommandKey === getInterventionCommandKey(command);
  }, [pendingCommandKey]);

  return {
    snapshot: state.snapshot,
    events: state.events,
    connectionStatus: state.connectionStatus,
    expandedCandidate,
    latestNotice: state.latestNotice,
    errorMessage: state.errorMessage,
    pendingCommandKey,
    sendIntervention,
    retryConnection,
    isCommandPending
  };
}
