# Phase 2: GitHub & Identity Merge - Research

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Source:** Codex technical investigation + Phase 1 implementation

---

## Phase Boundary

This phase delivers:
- GitHub user profile and repository fetching via REST API
- GitHub profile normalization to `NormalizedProfile` schema
- Identity resolution module for merging Bonjour + GitHub profiles
- Evidence extraction from both sources
- Unified `persons` table with cross-source linking

---

## Technical Research

### GitHub API Endpoints

| Endpoint | Purpose | Rate Limit |
|----------|---------|------------|
| `GET /users/{username}` | Fetch user profile | 5000/hour (auth) |
| `GET /users/{username}/repos` | Fetch user repositories | 5000/hour (auth) |
| `GET /user` (authenticated) | Current user info | 5000/hour |

**Base URL:** `https://api.github.com`

**Authentication:** Personal Access Token (PAT) recommended for higher rate limits

**Sample User Response:**
```json
{
  "login": "torvalds",
  "id": 1024025,
  "avatar_url": "https://avatars.githubusercontent.com/u/1024025",
  "html_url": "https://github.com/torvalds",
  "name": "Linus Torvalds",
  "company": null,
  "blog": "",
  "location": "Portland, OR",
  "email": null,
  "bio": null,
  "twitter_username": null,
  "public_repos": 7,
  "followers": 198000,
  "following": 0,
  "created_at": "2011-05-17T04:09:32Z",
  "updated_at": "2026-03-28T12:00:00Z"
}
```

**Sample Repository Response:**
```json
{
  "id": 23275940,
  "name": "linux",
  "full_name": "torvalds/linux",
  "html_url": "https://github.com/torvalds/linux",
  "description": "Linux kernel source tree",
  "stargazers_count": 180000,
  "forks_count": 53000,
  "language": "C",
  "created_at": "2014-08-25T15:48:20Z",
  "updated_at": "2026-03-28T00:00:00Z",
  "pushed_at": "2026-03-28T12:00:00Z"
}
```

### Database Schema (Phase 2 Tables)

```sql
-- Canonical person entity
create table persons (
  id uuid primary key default uuid_generate_v4(),
  primary_name text not null,
  primary_headline text,
  summary text,
  primary_location text,
  avatar_url text,
  search_status text not null default 'active',
  confidence_score numeric(5,4) not null default 0.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link source profiles to persons
create table person_identities (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references persons(id) on delete cascade,
  source_profile_id uuid not null references source_profiles(id) on delete cascade,
  match_score numeric(5,4) not null,
  match_reason jsonb not null default '[]'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_profile_id),
  unique (person_id, source_profile_id)
);

-- External handles/aliases
create table person_aliases (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references persons(id) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  source text not null,
  confidence_score numeric(5,4) not null default 0.0,
  created_at timestamptz not null default now(),
  unique (alias_type, alias_value, person_id)
);

-- Evidence items
create table evidence_items (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references persons(id) on delete cascade,
  source source_name not null,
  source_profile_id uuid references source_profiles(id) on delete set null,
  evidence_type evidence_type not null,
  title text,
  description text,
  url text,
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  evidence_hash text not null,
  created_at timestamptz not null default now(),
  unique (person_id, source, evidence_hash)
);

-- Enums for evidence
create type evidence_type as enum (
  'social',
  'project',
  'repository',
  'community_post',
  'job_signal',
  'education',
  'experience',
  'profile_field'
);
```

### Identity Resolution Strategy

**Match Signals (in priority order):**

1. **Explicit Links** (confidence: 1.0)
   - Bonjour `socials` contains GitHub URL/handle
   - GitHub profile website links back to bonjour.bio

2. **Same Name + Location** (confidence: 0.7-0.9)
   - Matching display names
   - Same or similar location strings

3. **Same Email/Domain** (confidence: 0.8-0.95)
   - Verified email on GitHub matches Bonjour
   - Same email domain in profile

4. **Cross-Platform Activity** (confidence: 0.6-0.8)
   - GitHub bio mentions same company/role as Bonjour
   - Repository topics match skills on Bonjour

**Merge Rules:**
- If confidence >= 0.9: Auto-merge
- If 0.7 <= confidence < 0.9: Add to review queue
- If confidence < 0.7: Keep separate

**Conflict Resolution:**
- Names: Use most complete/verified
- Location: Prefer most recent/verified
- Bio: Merge/concatenate with source attribution
- Avatar: Prefer most recent or let user choose

### Evidence Extraction Rules

**From Bonjour:**
| Source Field | Evidence Type | Extraction Rule |
|--------------|---------------|-----------------|
| `creations[]` | `project` | URL, title, description |
| `socials[]` | `social` | type mapped, value as URL/handle |
| `basicInfo.current_doing` | `profile_field` | current status |
| `basicInfo.role` | `profile_field` | role info |
| Community "Open to Work" | `job_signal` | job seeking signal |
| Community "We Are Hiring" | `job_signal` | hiring signal |

**From GitHub:**
| Source Field | Evidence Type | Extraction Rule |
|--------------|---------------|-----------------|
| `public_repos` list | `repository` | name, description, stars, language |
| `followers` count | `profile_field` | influence signal |
| `bio` | `profile_field` | bio text |
| `company` | `profile_field` | company info |
| `blog` | `social` | website URL |

### Package Structure for Phase 2

```
packages/
├─ adapters/
│  └─ github/           # NEW: GitHub adapter
│     ├─ client.ts      # GitHub HTTP client
│     ├─ normalize.ts   # Normalize to NormalizedProfile
│     ├─ repos.ts       # Repository fetching
│     └─ index.ts       # Exports
├─ identity/            # NEW: Identity resolution
│  ├─ matcher.ts        # Profile matching logic
│  ├─ merger.ts         # Merge policies
│  ├─ resolver.ts       # Main resolution pipeline
│  └─ index.ts          # Exports
├─ db/
│  └─ src/
│     ├─ schema.ts      # Add persons, person_identities, etc.
│     └─ repositories.ts # Add person/evidence repos
```

---

## Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| GitHub PAT for authentication | Higher rate limits, more reliable | Phase 2 |
| Confidence threshold 0.9 for auto-merge | Balance precision vs recall | Phase 2 |
| Evidence stored separately from profiles | Enables ranking explanations | Phase 2 |
| Conservative merge policy | Wrong merge worse than missed merge | Phase 2 |
| Review queue for ambiguous cases | Human oversight for edge cases | Phase 2 |

---

## Dependencies

- GitHub Personal Access Token (PAT) - user must provide
- Phase 1 infrastructure (database, adapters, types)
- No additional external services

---

## Recommended Build Order

1. **GitHub adapter** — Client, normalize, repository fetch
2. **Schema extension** — Add persons, person_identities, person_aliases, evidence_items tables
3. **Evidence extraction** — Extract from Bonjour + GitHub profiles
4. **Identity matcher** — Match profiles with confidence scoring
5. **Identity merger** — Merge profiles into persons
6. **Worker integration** — Wire GitHub sync + identity resolution

---

*Research completed 2026-03-29 based on Codex investigation and Phase 1 implementation*