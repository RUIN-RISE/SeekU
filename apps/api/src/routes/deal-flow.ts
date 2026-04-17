import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  and,
  desc,
  eq,
  evidenceItems,
  inArray,
  not,
  persons,
  searchDocuments,
  type EvidenceItem,
  type Person,
  type SearchDocument,
  type SeekuDatabase
} from "@seeku/db";
import {
  DailyDealFlowCurator,
  OpportunityScorer,
  buildUserGoalModel,
  type DealFlowCandidateState,
  type DirectionTag,
  type OpportunityCandidateInput,
  type UserGoalFeedbackEvent,
  type UserGoalInteractionEvent
} from "@seeku/search";

const DEFAULT_VIEWER_ID = "demo-viewer";
export const DEFAULT_DEAL_FLOW_GOAL =
  "I want to meet builders working on AI agents and developer tools for an ambitious company.";

const KNOWN_DIRECTION_TAGS = new Set<DirectionTag>([
  "ai_agents",
  "ai_infra",
  "developer_tools",
  "education",
  "enterprise_ai",
  "open_source",
  "robotics",
  "healthcare",
  "fintech",
  "creator_media"
]);

const FEEDBACK_KINDS = new Set<UserGoalFeedbackEvent["kind"]>([
  "interested",
  "not_interested",
  "contacted",
  "revisit"
]);

const INTERACTION_KINDS = new Set<UserGoalInteractionEvent["kind"]>([
  "detail_view",
  "repeat_view",
  "evidence_expand",
  "dwell"
]);

interface DealFlowQuerystring {
  viewerId?: string;
  goal?: string;
}

interface DealFlowFeedbackBody {
  viewerId?: unknown;
  personId?: unknown;
  kind?: unknown;
  directionTags?: unknown;
  note?: unknown;
}

interface DealFlowInteractionBody {
  viewerId?: unknown;
  personId?: unknown;
  kind?: unknown;
  directionTags?: unknown;
  note?: unknown;
}

interface CandidateStateRecord {
  seenCount: number;
  detailViewCount: number;
  repeatViewCount: number;
  lastFeedbackKind: UserGoalFeedbackEvent["kind"] | null;
  contactedAt: string | null;
  lastSurfacedAt: string | null;
}

interface ViewerStateRecord {
  feedbackEvents: UserGoalFeedbackEvent[];
  interactionEvents: UserGoalInteractionEvent[];
  candidateStates: Map<string, CandidateStateRecord>;
}

interface DealFlowViewerSnapshot {
  viewerId: string;
  feedbackCounts: Record<UserGoalFeedbackEvent["kind"], number>;
  interactionCounts: Record<UserGoalInteractionEvent["kind"], number>;
  surfacedCandidates: number;
}

interface DealFlowCardState {
  seenCount: number;
  detailViewCount: number;
  repeatViewCount: number;
  lastFeedbackKind: UserGoalFeedbackEvent["kind"] | null;
}

interface DealFlowEvidencePreview {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  url: string | null;
}

export interface DealFlowCard {
  personId: string;
  name: string;
  headline: string | null;
  bucket: "new" | "high-confidence" | "needs-validation" | "revisit";
  confidence: "high" | "medium" | "low";
  totalScore: number;
  whyMatched: string;
  whyNow: string;
  approachPath: string;
  whyUncertain?: string;
  directionSummary: string;
  directionTags: DirectionTag[];
  overlapTags: DirectionTag[];
  sourceBadges: string[];
  evidencePreview: DealFlowEvidencePreview[];
  state: DealFlowCardState;
}

export interface DealFlowResponseBody {
  artifact: {
    generatedForDate: string;
    generatedAt: string;
    topToday: DealFlowCard[];
    moreOpportunities: DealFlowCard[];
    totalCandidates: number;
    bucketCounts: Record<"new" | "high-confidence" | "needs-validation" | "revisit", number>;
  };
  goalModel: {
    explicitGoal: string | null;
    summary: string;
    driftStatus: "unknown" | "aligned" | "shifting";
    dominantDirectionTags: DirectionTag[];
    signalSources: Array<
      "explicit_goal" | "current_conditions" | "search_history" | "feedback" | "interaction"
    >;
  };
  viewer: DealFlowViewerSnapshot;
  driftNote?: string;
}

interface DealFlowFeedbackResponseBody {
  ok: true;
  viewer: DealFlowViewerSnapshot;
}

interface DealFlowRouteOptions {
  store?: DealFlowStateStore;
  loadCandidates?: (input: {
    db: SeekuDatabase;
    viewerId: string;
    now: Date;
  }) => Promise<OpportunityCandidateInput[]>;
  scorer?: OpportunityScorer;
  curator?: DailyDealFlowCurator;
  now?: () => Date;
}

export interface DealFlowStateStore {
  buildCandidateState(viewerId: string, personId: string, now: Date): DealFlowCandidateState | undefined;
  recordFeedback(
    viewerId: string,
    input: {
      personId: string;
      kind: UserGoalFeedbackEvent["kind"];
      directionTags: DirectionTag[];
      note?: string | null;
    },
    now: Date
  ): DealFlowViewerSnapshot;
  recordInteraction(
    viewerId: string,
    input: {
      personId: string;
      kind: UserGoalInteractionEvent["kind"];
      directionTags: DirectionTag[];
      note?: string | null;
    },
    now: Date
  ): DealFlowViewerSnapshot;
  markSurfaced(viewerId: string, personIds: string[], now: Date): void;
  snapshotViewer(viewerId: string): DealFlowViewerSnapshot;
  getFeedbackEvents(viewerId: string): UserGoalFeedbackEvent[];
  getInteractionEvents(viewerId: string): UserGoalInteractionEvent[];
}

class MemoryDealFlowStateStore implements DealFlowStateStore {
  private readonly viewers = new Map<string, ViewerStateRecord>();

  buildCandidateState(viewerId: string, personId: string, now: Date): DealFlowCandidateState | undefined {
    const candidate = this.ensureCandidateState(viewerId, personId);
    const lastSurfacedAt = candidate.lastSurfacedAt ? new Date(candidate.lastSurfacedAt) : null;

    return {
      seenCount: candidate.seenCount,
      detailViewCount: candidate.detailViewCount,
      repeatViewCount: candidate.repeatViewCount,
      daysSinceLastSurfaced: lastSurfacedAt ? diffDays(lastSurfacedAt, now) : null,
      lastFeedbackKind: candidate.lastFeedbackKind,
      contactedAt: candidate.contactedAt ? new Date(candidate.contactedAt) : null
    };
  }

  recordFeedback(
    viewerId: string,
    input: {
      personId: string;
      kind: UserGoalFeedbackEvent["kind"];
      directionTags: DirectionTag[];
      note?: string | null;
    },
    now: Date
  ): DealFlowViewerSnapshot {
    const viewer = this.ensureViewer(viewerId);
    const candidate = this.ensureCandidateState(viewerId, input.personId);

    candidate.lastFeedbackKind = input.kind;
    if (input.kind === "contacted") {
      candidate.contactedAt = now.toISOString();
    }

    viewer.feedbackEvents.push({
      kind: input.kind,
      directionTags: input.directionTags,
      note: input.note ?? null,
      timestamp: now
    });

    return this.snapshotViewer(viewerId);
  }

  recordInteraction(
    viewerId: string,
    input: {
      personId: string;
      kind: UserGoalInteractionEvent["kind"];
      directionTags: DirectionTag[];
      note?: string | null;
    },
    now: Date
  ): DealFlowViewerSnapshot {
    const viewer = this.ensureViewer(viewerId);
    const candidate = this.ensureCandidateState(viewerId, input.personId);

    if (input.kind === "detail_view") {
      candidate.detailViewCount += 1;
      if (candidate.detailViewCount > 1) {
        candidate.repeatViewCount += 1;
      }
    }

    if (input.kind === "repeat_view") {
      candidate.repeatViewCount += 1;
    }

    viewer.interactionEvents.push({
      kind: input.kind,
      directionTags: input.directionTags,
      note: input.note ?? null,
      timestamp: now
    });

    return this.snapshotViewer(viewerId);
  }

  markSurfaced(viewerId: string, personIds: string[], now: Date): void {
    for (const personId of personIds) {
      const candidate = this.ensureCandidateState(viewerId, personId);
      if (candidate.lastSurfacedAt) {
        candidate.repeatViewCount += 1;
      }
      candidate.seenCount += 1;
      candidate.lastSurfacedAt = now.toISOString();
    }
  }

  snapshotViewer(viewerId: string): DealFlowViewerSnapshot {
    const viewer = this.ensureViewer(viewerId);

    return {
      viewerId,
      feedbackCounts: {
        interested: viewer.feedbackEvents.filter((event) => event.kind === "interested").length,
        not_interested: viewer.feedbackEvents.filter((event) => event.kind === "not_interested").length,
        contacted: viewer.feedbackEvents.filter((event) => event.kind === "contacted").length,
        revisit: viewer.feedbackEvents.filter((event) => event.kind === "revisit").length
      },
      interactionCounts: {
        detail_view: viewer.interactionEvents.filter((event) => event.kind === "detail_view").length,
        repeat_view: viewer.interactionEvents.filter((event) => event.kind === "repeat_view").length,
        evidence_expand: viewer.interactionEvents.filter((event) => event.kind === "evidence_expand").length,
        dwell: viewer.interactionEvents.filter((event) => event.kind === "dwell").length
      },
      surfacedCandidates: viewer.candidateStates.size
    };
  }

  getFeedbackEvents(viewerId: string): UserGoalFeedbackEvent[] {
    return [...this.ensureViewer(viewerId).feedbackEvents];
  }

  getInteractionEvents(viewerId: string): UserGoalInteractionEvent[] {
    return [...this.ensureViewer(viewerId).interactionEvents];
  }

  private ensureViewer(viewerId: string): ViewerStateRecord {
    const existing = this.viewers.get(viewerId);
    if (existing) {
      return existing;
    }

    const created: ViewerStateRecord = {
      feedbackEvents: [],
      interactionEvents: [],
      candidateStates: new Map<string, CandidateStateRecord>()
    };
    this.viewers.set(viewerId, created);
    return created;
  }

  private ensureCandidateState(viewerId: string, personId: string): CandidateStateRecord {
    const viewer = this.ensureViewer(viewerId);
    const existing = viewer.candidateStates.get(personId);
    if (existing) {
      return existing;
    }

    const created: CandidateStateRecord = {
      seenCount: 0,
      detailViewCount: 0,
      repeatViewCount: 0,
      lastFeedbackKind: null,
      contactedAt: null,
      lastSurfacedAt: null
    };
    viewer.candidateStates.set(personId, created);
    return created;
  }
}

function diffDays(left: Date, right: Date): number {
  return Math.max(0, Math.floor((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24)));
}

function parseViewerId(input: unknown): string {
  return typeof input === "string" && input.trim() ? input.trim() : DEFAULT_VIEWER_ID;
}

function parseGoal(input: unknown): string {
  return typeof input === "string" && input.trim() ? input.trim() : DEFAULT_DEAL_FLOW_GOAL;
}

function parseDirectionTags(input: unknown): DirectionTag[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input.filter((value): value is DirectionTag => (
        typeof value === "string" && KNOWN_DIRECTION_TAGS.has(value as DirectionTag)
      ))
    )
  );
}

function parseFeedbackBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as DealFlowFeedbackBody;
  const viewerId = parseViewerId(value.viewerId);
  const personId = typeof value.personId === "string" ? value.personId.trim() : "";
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";

  if (!personId) {
    throw new Error("personId is required.");
  }

  if (!FEEDBACK_KINDS.has(kind as UserGoalFeedbackEvent["kind"])) {
    throw new Error("kind is invalid.");
  }

  return {
    viewerId,
    personId,
    kind: kind as UserGoalFeedbackEvent["kind"],
    directionTags: parseDirectionTags(value.directionTags),
    note: typeof value.note === "string" ? value.note.trim() || null : null
  };
}

function parseInteractionBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as DealFlowInteractionBody;
  const viewerId = parseViewerId(value.viewerId);
  const personId = typeof value.personId === "string" ? value.personId.trim() : "";
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";

  if (!personId) {
    throw new Error("personId is required.");
  }

  if (!INTERACTION_KINDS.has(kind as UserGoalInteractionEvent["kind"])) {
    throw new Error("kind is invalid.");
  }

  return {
    viewerId,
    personId,
    kind: kind as UserGoalInteractionEvent["kind"],
    directionTags: parseDirectionTags(value.directionTags),
    note: typeof value.note === "string" ? value.note.trim() || null : null
  };
}

async function defaultLoadCandidates(input: {
  db: SeekuDatabase;
  viewerId: string;
  store: DealFlowStateStore;
  now: Date;
}): Promise<OpportunityCandidateInput[]> {
  const rows = await input.db
    .select({
      person: persons,
      document: searchDocuments
    })
    .from(persons)
    .innerJoin(searchDocuments, eq(searchDocuments.personId, persons.id))
    .where(and(not(eq(persons.searchStatus, "hidden"))))
    .orderBy(desc(searchDocuments.updatedAt))
    .limit(120);

  const preferredRows = rows.filter((row) =>
    (row.document.facetTags ?? []).some((tag) => tag.startsWith("direction:"))
  );
  const selectedRows = (preferredRows.length > 0 ? preferredRows : rows).slice(0, 60);
  const personIds = selectedRows.map((row) => row.person.id);

  if (personIds.length === 0) {
    return [];
  }

  const evidence = await input.db
    .select()
    .from(evidenceItems)
    .where(inArray(evidenceItems.personId, personIds));

  const evidenceMap = new Map<string, EvidenceItem[]>();
  for (const item of evidence) {
    const current = evidenceMap.get(item.personId) ?? [];
    current.push(item);
    evidenceMap.set(item.personId, current);
  }

  return selectedRows.map((row) => ({
    person: row.person,
    document: row.document,
    evidence: evidenceMap.get(row.person.id) ?? [],
    state: input.store.buildCandidateState(input.viewerId, row.person.id, input.now)
  }));
}

function buildEvidencePreview(evidence: EvidenceItem[]): DealFlowEvidencePreview[] {
  return evidence.slice(0, 4).map((item) => ({
    id: item.id,
    type: item.evidenceType,
    title: item.title ?? null,
    description: item.description ?? null,
    url: item.url ?? null
  }));
}

function buildCardState(state: DealFlowCandidateState | undefined): DealFlowCardState {
  return {
    seenCount: state?.seenCount ?? 0,
    detailViewCount: state?.detailViewCount ?? 0,
    repeatViewCount: state?.repeatViewCount ?? 0,
    lastFeedbackKind: state?.lastFeedbackKind ?? null
  };
}

function toDealFlowCard(result: Awaited<ReturnType<OpportunityScorer["scoreCandidate"]>>): DealFlowCard {
  return {
    personId: result.personId,
    name: result.name,
    headline: result.headline,
    bucket: result.bucket,
    confidence: result.confidence,
    totalScore: result.totalScore,
    whyMatched: result.whyMatched,
    whyNow: result.whyNow,
    approachPath: result.approachPath,
    whyUncertain: result.whyUncertain,
    directionSummary: result.directionProfile.summary,
    directionTags: result.directionProfile.directionTags,
    overlapTags: result.directionOverlapTags,
    sourceBadges: result.candidate.document?.facetSource ?? [],
    evidencePreview: buildEvidencePreview(result.candidate.evidence),
    state: buildCardState(result.candidate.state)
  };
}

function buildDriftNote(driftStatus: "unknown" | "aligned" | "shifting"): string | undefined {
  if (driftStatus === "shifting") {
    return "Recent feedback and behavior are starting to lean away from the original stated direction. Keep the list exploratory until that settles.";
  }

  return undefined;
}

async function handleDealFlow(
  db: SeekuDatabase,
  options: Required<Pick<DealFlowRouteOptions, "store" | "scorer" | "curator" | "now">> &
    Pick<DealFlowRouteOptions, "loadCandidates">,
  request: FastifyRequest<{ Querystring: DealFlowQuerystring }>
): Promise<DealFlowResponseBody> {
  const viewerId = parseViewerId(request.query.viewerId);
  const explicitGoal = parseGoal(request.query.goal);
  const now = options.now();
  const candidates = await (options.loadCandidates
    ? options.loadCandidates({ db, viewerId, now })
    : defaultLoadCandidates({ db, viewerId, store: options.store, now }));

  const goalModel = buildUserGoalModel({
    explicitGoal,
    feedbackEvents: options.store.getFeedbackEvents(viewerId),
    interactionEvents: options.store.getInteractionEvents(viewerId),
    updatedAt: now
  });
  const scored = options.scorer.scoreCandidates(goalModel, candidates);
  const artifact = options.curator.curate(scored, now);
  const surfacedIds = [...artifact.topToday, ...artifact.moreOpportunities].map((item) => item.personId);
  options.store.markSurfaced(viewerId, surfacedIds, now);

  return {
    artifact: {
      generatedForDate: artifact.generatedForDate,
      generatedAt: artifact.generatedAt,
      topToday: artifact.topToday.map(toDealFlowCard),
      moreOpportunities: artifact.moreOpportunities.map(toDealFlowCard),
      totalCandidates: artifact.totalCandidates,
      bucketCounts: artifact.bucketCounts
    },
    goalModel: {
      explicitGoal: goalModel.explicitGoal,
      summary: goalModel.summary,
      driftStatus: goalModel.driftStatus,
      dominantDirectionTags: goalModel.dominantDirectionTags,
      signalSources: goalModel.signalSources
    },
    viewer: options.store.snapshotViewer(viewerId),
    driftNote: buildDriftNote(goalModel.driftStatus)
  };
}

function sendInvalidRequest(reply: FastifyReply, error: unknown) {
  return reply.status(400).send({
    error: "invalid_request",
    message: error instanceof Error ? error.message : String(error)
  });
}

export function registerDealFlowRoutes(
  server: FastifyInstance,
  db: SeekuDatabase,
  options: DealFlowRouteOptions = {}
) {
  const resolved = {
    store: options.store ?? new MemoryDealFlowStateStore(),
    scorer: options.scorer ?? new OpportunityScorer(),
    curator: options.curator ?? new DailyDealFlowCurator(),
    now: options.now ?? (() => new Date()),
    loadCandidates: options.loadCandidates
  };

  server.get<{ Querystring: DealFlowQuerystring }>("/deal-flow", async (request) =>
    handleDealFlow(db, resolved, request)
  );

  server.post("/deal-flow/feedback", async (request, reply): Promise<DealFlowFeedbackResponseBody | ReturnType<FastifyReply["status"]>> => {
    let parsed: ReturnType<typeof parseFeedbackBody>;

    try {
      parsed = parseFeedbackBody(request.body);
    } catch (error) {
      return sendInvalidRequest(reply, error);
    }

    return {
      ok: true,
      viewer: resolved.store.recordFeedback(parsed.viewerId, parsed, resolved.now())
    };
  });

  server.post("/deal-flow/interactions", async (request, reply): Promise<DealFlowFeedbackResponseBody | ReturnType<FastifyReply["status"]>> => {
    let parsed: ReturnType<typeof parseInteractionBody>;

    try {
      parsed = parseInteractionBody(request.body);
    } catch (error) {
      return sendInvalidRequest(reply, error);
    }

    return {
      ok: true,
      viewer: resolved.store.recordInteraction(parsed.viewerId, parsed, resolved.now())
    };
  });
}

export function createMemoryDealFlowStateStore(): DealFlowStateStore {
  return new MemoryDealFlowStateStore();
}

export function createDealFlowCandidate(input: {
  person: Person;
  document?: SearchDocument;
  evidence?: EvidenceItem[];
  state?: DealFlowCandidateState;
}): OpportunityCandidateInput {
  return {
    person: input.person,
    document: input.document,
    evidence: input.evidence ?? [],
    state: input.state
  };
}
