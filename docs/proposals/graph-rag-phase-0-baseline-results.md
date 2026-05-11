# Graph Signals Phase 0 Baseline Results

**Date**: 2026-05-03
**Project**: Seeku

## Summary

This document captures the baseline retrieval metrics before any graph signal integration.

---

## 1. Acceptance Test Results

**Overall**: 11/12 passing (91.7%)

### Detailed Results

```
🧪 CLI Agent Eval Harness

Acceptance: 11 / 12
  - PASS A1 我先想在杭州看看人选。 · clarify
  - PASS A2 帮我找杭州做 Python 后端的人。 · search
  - PASS A3 我先随便看看。 · search
  - PASS A4 我想看 GitHub 上活跃的 ML engineer。 · search -> compare
  - FAIL A5 开源 AI founder 或 tech lead，最好自己做过项目。 · search -> compare · conditional-recommendation
    recommendation expected clear-recommendation, got conditional-recommendation
  - PASS A6 我想找 RAG / 检索工程师，但别太武断。 · search -> compare · conditional-recommendation
  - PASS A7 多模态视觉工程师，但如果结果太散先别推荐。 · search -> narrow
  - PASS A8 先给我一个 AI infra / backend builder 的 shortlist。 · search -> narrow
  - PASS A9 证据不够就别乱推荐，我只接受诚实 compare。 · search -> compare · no-recommendation
  - PASS A10 先比较 2-3 个 Python 后端 builder，最好有清晰主推。 · search -> compare · clear-recommendation
  - PASS A11 帮我比较两个 Python 候选人，但如果只差一点就给条件式建议。 · search -> compare · conditional-recommendation
  - PASS A12 像 shortlist 2 号但更偏后端和 serving。 · search
```

### Failure Analysis

**A5: 开源 AI founder 或 tech lead**

- Expected: `clear-recommendation`
- Got: `conditional-recommendation`
- Root cause: The policy logic requires stronger score separation for clear recommendations
- Impact: Minor - still produces a valid compare outcome

---

## 2. Regression Test Results

**Overall**: 3/3 passing (100%)

### Query Coverage

| ID | Query | Expected Label | Result | Total Results | GitHub in Top 3 | GitHub in Top 5 |
|----|-------|----------------|--------|---------------|-----------------|-----------------|
| Q4 | RAG 检索工程师 | watch-but-stable | PASS | 10 | 2 | 3 |
| Q6 | GitHub 上活跃的 ML engineer | pass | PASS | 10 | 3 | 5 |
| Q8 | 开源 AI founder 或 tech lead | pass | PASS | 10 | 3 | 5 |

### Sample Results

**Q4: RAG 检索工程师**

| Rank | Name | Sources | Match Score |
|------|------|---------|-------------|
| 1 | 达峰的夏天 | Bonjour, GitHub | 0.484 |
| 2 | 王白水 | Bonjour, GitHub | 0.479 |
| 3 | Tom | Bonjour | 0.459 |

**Q6: GitHub 上活跃的 ML engineer**

| Rank | Name | Sources | Match Score |
|------|------|---------|-------------|
| 1 | yedongxi | GitHub | 0.438 |
| 2 | learnbydoingwithsteven | GitHub | 0.401 |
| 3 | NJX | GitHub | 0.368 |

**Q8: 开源 AI founder 或 tech lead**

| Rank | Name | Sources | Match Score |
|------|------|---------|-------------|
| 1 | NJX | GitHub | 1.754 |
| 2 | Sense_wang | GitHub | 1.517 |
| 3 | RoomWithOutRoof | GitHub | 1.395 |

---

## 3. Data Coverage Metrics

### 3.1 Person and Profile Coverage

| Metric | Count | Percentage |
|--------|-------|------------|
| Total persons | 25,191 | 100% |
| Persons linked to Bonjour | 22,497 | 89.3% |
| Persons with search documents | 25,191 | 100% |
| Persons with embeddings | 8,074 | 32.1% |

### 3.2 Source Profile Distribution

| Source | Count | Percentage |
|--------|-------|------------|
| Bonjour | 23,281 | 89.4% |
| Other sources | 2,780 | 10.6% |

### 3.3 Embedding Coverage Gap

```
Persons with embeddings:    8,074 (32.1%)
Persons without embeddings: 17,117 (67.9%)
```

This is a **critical gap** for any graph model training that requires node features.

---

## 4. Friend-Link Data Coverage

### 4.1 Database State

| Metric | Count |
|--------|-------|
| Profiles with `authFriendLinkPreview` | 2,430 |
| Actual edge data in database | 0 |

### 4.2 Crawl Artifact State

| Metric | Value |
|--------|-------|
| Unique profiles in crawl | 16,411 |
| Total friend edges | 127,338 |
| Total friended edges | 131,938 |
| Estimated unique edges | ~129,000 |

### 4.3 Coverage Percentage

```
Bonjour profiles in DB:        23,281
Profiles with crawl data:      16,411
Coverage:                      70.5%
```

---

## 5. Graph Structure Estimates

### 5.1 Degree Distribution

| Neighbor Count | Profiles | Percentage |
|----------------|----------|------------|
| 0 | 120 | 0.7% |
| 1-5 | 9,110 | 55.5% |
| 6-20 | 4,372 | 26.6% |
| 21-50 | 1,740 | 10.6% |
| 51-100 | 676 | 4.1% |
| 100+ | 393 | 2.4% |

### 5.2 Key Statistics

- **Min degree**: 0
- **Max degree**: 6,218
- **Median degree**: 4
- **Average degree**: ~15.7

### 5.3 Head-Heavy Distribution

The top 2.4% of profiles (393 profiles with 100+ neighbors) account for a disproportionate share of edges. This indicates:
1. BFS sampling bias from crawl strategy
2. Potential "hub" profiles that could dominate graph-based recommendations

---

## 6. Memory System Status

### 6.1 Table Status

| Table | Status |
|-------|--------|
| `user_memories` | NOT CREATED |
| `candidate_feedback_memories` | NOT CREATED |

### 6.2 Migration Files

| File | Status |
|------|--------|
| `packages/db/src/migrations/0005_user_memories.sql` | EXISTS, NOT EXECUTED |
| `packages/db/src/migrations/0006_candidate_feedback_memories.sql` | EXISTS, NOT EXECUTED |

---

## 7. Eval Harness Location

- **Acceptance fixtures**: `apps/worker/src/cli/agent-eval-fixtures.ts`
- **Eval runner**: `apps/worker/src/cli/agent-eval.ts`
- **Snapshot baseline**: `.planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup/`
- **Manual checklist**: `docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md`

---

## 8. Baseline Assessment

### Strengths

1. **Hybrid retrieval working**: Keyword + vector combination produces relevant results
2. **GitHub source filtering effective**: Q6 and Q8 show strong GitHub-only results
3. **Policy decisions reasonable**: Clarify/search/narrow/compare logic mostly correct

### Weaknesses

1. **No graph-oriented eval**: No queries testing "who knows X" or "mutual connections"
2. **Embedding coverage gap**: 68% of persons lack embeddings
3. **Graph data not materialized**: 129K edges in files, 0 in database
4. **Memory system dormant**: Tables not created despite schema design

### Opportunities for Graph Signals

Based on the baseline, graph signals could help with:

1. **"Who has mutual connections with X"** queries (not currently testable)
2. **Trust/proximity signals** for cold-start candidates
3. **Community detection** for candidate clustering

### Risks

1. **Weak edge semantics**: "follow" does not imply trust or collaboration
2. **BFS bias**: Head nodes over-represented in crawl data
3. **Coverage gap**: Only 70.5% of Bonjour profiles have crawl data

---

## 9. Recommendations for Phase 1

### Immediate Actions

1. **Run memory migrations** (1 hour effort)
   ```bash
   pnpm db:migrate
   ```
   This should apply the pending Drizzle migrations, including:
   - `0005_user_memories.sql`
   - `0006_candidate_feedback_memories.sql`

2. **Create graph_edges table** (1 day effort)
   ```sql
   CREATE TABLE graph_edges (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     source_person_id UUID NOT NULL REFERENCES persons(id),
     target_person_id UUID NOT NULL REFERENCES persons(id),
     edge_type TEXT NOT NULL CHECK (edge_type IN ('friend', 'friended')),
     source_profile_id UUID REFERENCES source_profiles(id),
     imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE (source_person_id, target_person_id, edge_type)
   );
   ```

3. **Import edges from crawl artifacts** (2-3 days effort)

### Metrics to Track in Phase 1

| Metric | Current | Target |
|--------|---------|--------|
| Graph edges in DB | 0 | 100,000+ |
| Memory tables created | No | Yes |
| Graph-oriented eval queries | 0 | 5+ |
| Embedding coverage | 32.1% | 50%+ (stretch) |

---

## Appendix: Raw Eval Output

```
🧪 CLI Agent Eval Harness

Acceptance: 11 / 12
  - PASS A1 我先想在杭州看看人选。 · clarify
  - PASS A2 帮我找杭州做 Python 后端的人。 · search
  - PASS A3 我先随便看看。 · search
  - PASS A4 我想看 GitHub 上活跃的 ML engineer。 · search -> compare
  - FAIL A5 开源 AI founder 或 tech lead，最好自己做过项目。 · search -> compare · conditional-recommendation
    recommendation expected clear-recommendation, got conditional-recommendation
  - PASS A6 我想找 RAG / 检索工程师，但别太武断。 · search -> compare · conditional-recommendation
  - PASS A7 多模态视觉工程师，但如果结果太散先别推荐。 · search -> narrow
  - PASS A8 先给我一个 AI infra / backend builder 的 shortlist。 · search -> narrow
  - PASS A9 证据不够就别乱推荐，我只接受诚实 compare。 · search -> compare · no-recommendation
  - PASS A10 先比较 2-3 个 Python 后端 builder，最好有清晰主推。 · search -> compare · clear-recommendation
  - PASS A11 帮我比较两个 Python 候选人，但如果只差一点就给条件式建议。 · search -> compare · conditional-recommendation
  - PASS A12 像 shortlist 2 号但更偏后端和 serving。 · search

Regression: 3 / 3
  - PASS Q4 (watch-but-stable) · top3 GitHub 2 · top5 GitHub 3
  - PASS Q6 (pass) · top3 GitHub 3 · top5 GitHub 5
  - PASS Q8 (pass) · top3 GitHub 3 · top5 GitHub 5

Manual checklist: /Users/rosscai/seeku/docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md
Snapshot baseline: /Users/rosscai/seeku/.planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup
```
