# Requirements: Seeku v1.4 Daily Deal Flow

**Defined:** 2026-04-17
**Core Value:** Find the right AI talent through what they've done, not what they claim. Evidence-based matching over profile text matching.
**Milestone:** `v1.4 Daily Deal Flow`
**Status:** Active

## v1.4 Requirements

### Daily Opportunity Generation

- [ ] **DFLOW-01**: Seeku generates one in-product daily deal flow from the existing Seeku candidate corpus instead of waiting for an explicit search request.
- [ ] **DFLOW-02**: Each daily deal flow contains `5-10` candidates and separates `Top 3 today` from the rest of the opportunity list.
- [ ] **DFLOW-03**: Every surfaced candidate is assigned exactly one bucket: `new`, `high-confidence`, `needs-validation`, or `revisit`.

### Goal And Candidate Modeling

- [ ] **DFLOW-04**: The system maintains a user goal model that combines explicit long-term cofounder goals with recent Seeku behavior and feedback.
- [ ] **DFLOW-05**: The system derives a candidate direction profile from public-expression evidence such as bio, headline, self-description, and project text.
- [ ] **DFLOW-06**: Opportunity ranking is driven primarily by goal-direction match, with secondary tuning from freshness, reachability, engagement fit, and revisit pressure.

### Explanations And Actionability

- [ ] **DFLOW-07**: Every daily deal flow card explains why the candidate appears directionally aligned with the user's cofounder goal.
- [ ] **DFLOW-08**: Every daily deal flow card explains why the candidate is worth acting on today rather than only being generally relevant.
- [ ] **DFLOW-09**: Every daily deal flow card provides a concrete approach path that tells the user how to initiate contact.
- [ ] **DFLOW-10**: Every daily deal flow card exposes an honest confidence classification plus a short statement of uncertainty when evidence is incomplete.

### Feedback And Learning

- [ ] **DFLOW-11**: The deal flow surface supports explicit feedback actions: `感兴趣`, `不感兴趣`, `已联系`, and `稍后再看`.
- [ ] **DFLOW-12**: The system records high-signal implicit behavior such as detail opens, evidence expansion, repeat views, or dwell time to refine subsequent daily lists.
- [ ] **DFLOW-13**: Explicit and implicit feedback must alter future deal flow ranking or bucketing in a visible, testable way.

### Drift And Product Integrity

- [ ] **DFLOW-14**: When recent behavior diverges from the user's explicit long-term cofounder goal, the daily deal flow may show a short drift note that explains the reweighting.
- [ ] **DFLOW-15**: The daily deal flow remains an in-product proactive surface and does not send outbound messages or external notifications in v1.4.
- [ ] **DFLOW-16**: The new deal flow layer must build on the shipped search/runtime foundation without weakening recommendation honesty, compare gating, or saved search-quality posture.

## v2 Requirements

### Distribution And Execution

- **DFLOW-V2-01**: Send daily deal flow summaries through external delivery channels such as IM or email.
- **DFLOW-V2-02**: Generate personalized outreach drafts per candidate and per approach path.
- **DFLOW-V2-03**: Track multi-stage relationship progression in a lightweight CRM or pipeline view.

### Broader Sourcing

- **DFLOW-V2-04**: Expand the daily opportunity pool beyond the existing Seeku corpus.
- **DFLOW-V2-05**: Incorporate richer candidate-intent inference beyond public-expression evidence.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-sending outreach messages | Too much autonomy for the first proactive milestone |
| External push delivery | Keep v1.4 inside Seeku until the daily list proves valuable |
| Whole-internet sourcing | Would blur product validation with corpus expansion work |
| Full relationship CRM | Too heavy for the first opportunity-flow milestone |
| Personality-level user modeling | Overreaches beyond product-local evidence and slows delivery |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DFLOW-01 | Phase 09 | Pending |
| DFLOW-02 | Phase 09 | Pending |
| DFLOW-03 | Phase 09 | Pending |
| DFLOW-04 | Phase 09 | Pending |
| DFLOW-05 | Phase 09 | Pending |
| DFLOW-06 | Phase 09 | Pending |
| DFLOW-07 | Phase 09 | Pending |
| DFLOW-08 | Phase 09 | Pending |
| DFLOW-09 | Phase 09 | Pending |
| DFLOW-10 | Phase 09 | Pending |
| DFLOW-11 | Phase 09 | Pending |
| DFLOW-12 | Phase 09 | Pending |
| DFLOW-13 | Phase 09 | Pending |
| DFLOW-14 | Phase 09 | Pending |
| DFLOW-15 | Phase 09 | Pending |
| DFLOW-16 | Phase 09 | Pending |

**Coverage:**
- v1.4 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after approving the Daily Deal Flow design spec*
