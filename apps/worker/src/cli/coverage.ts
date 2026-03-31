import "dotenv/config";

import chalk from "chalk";

import { createDatabaseConnection, sql, type SeekuDatabase } from "@seeku/db";

export interface CoverageMetric {
  count: number;
  total: number;
  ratio: number;
  missing: number;
}

export interface CoverageSnapshot {
  activePersons: number;
  indexed: CoverageMetric;
  embedded: CoverageMetric;
  multiSource: CoverageMetric;
  githubCovered: CoverageMetric;
}

function buildCoverageMetric(count: number, total: number): CoverageMetric {
  const safeTotal = Math.max(0, total);
  const normalizedCount = Math.max(0, count);
  return {
    count: normalizedCount,
    total: safeTotal,
    ratio: safeTotal === 0 ? 0 : normalizedCount / safeTotal,
    missing: Math.max(0, safeTotal - normalizedCount)
  };
}

function formatPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCoverageLine(label: string, metric: CoverageMetric) {
  return `${label.padEnd(15)} ${String(metric.count).padStart(4)} / ${String(metric.total).padEnd(4)} ${formatPercentage(metric.ratio).padStart(6)}  缺口 ${metric.missing}`;
}

export function formatCoverageReport(snapshot: CoverageSnapshot) {
  return [
    chalk.bold("Seeku Coverage"),
    `active persons   ${snapshot.activePersons}`,
    formatCoverageLine("indexed", snapshot.indexed),
    formatCoverageLine("embedded", snapshot.embedded),
    formatCoverageLine("multi-source", snapshot.multiSource),
    formatCoverageLine("github-covered", snapshot.githubCovered)
  ].join("\n");
}

export async function getCoverageSnapshot(db: SeekuDatabase): Promise<CoverageSnapshot> {
  const [
    activeRows,
    indexedRows,
    embeddedRows,
    multiSourceRows,
    githubCoveredRows
  ] = await Promise.all([
    db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from persons
      where search_status = 'active'
    `),
    db.execute<{ count: number }>(sql`
      select count(distinct p.id)::int as count
      from persons p
      join search_documents sd on sd.person_id = p.id
      where p.search_status = 'active'
    `),
    db.execute<{ count: number }>(sql`
      select count(distinct p.id)::int as count
      from persons p
      join search_embeddings se on se.person_id = p.id
      where p.search_status = 'active'
    `),
    db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from (
        select p.id
        from persons p
        join person_identities pi on pi.person_id = p.id
        join source_profiles sp on sp.id = pi.source_profile_id
        where p.search_status = 'active'
        group by p.id
        having count(distinct sp.source) >= 2
      ) multi_source_people
    `),
    db.execute<{ count: number }>(sql`
      select count(distinct p.id)::int as count
      from persons p
      join evidence_items ei on ei.person_id = p.id
      where p.search_status = 'active'
        and ei.source = 'github'
        and ei.evidence_type = 'repository'
    `)
  ]);

  const activePersons = activeRows[0]?.count ?? 0;
  const indexed = indexedRows[0]?.count ?? 0;
  const embedded = embeddedRows[0]?.count ?? 0;
  const multiSource = multiSourceRows[0]?.count ?? 0;
  const githubCovered = githubCoveredRows[0]?.count ?? 0;

  return {
    activePersons,
    indexed: buildCoverageMetric(indexed, activePersons),
    embedded: buildCoverageMetric(embedded, activePersons),
    multiSource: buildCoverageMetric(multiSource, activePersons),
    githubCovered: buildCoverageMetric(githubCovered, activePersons)
  };
}

export async function runCoverageCli(options: { json?: boolean } = {}) {
  const { db, close } = createDatabaseConnection();

  try {
    const snapshot = await getCoverageSnapshot(db);
    if (options.json) {
      return snapshot;
    }

    return formatCoverageReport(snapshot);
  } finally {
    await close();
  }
}
