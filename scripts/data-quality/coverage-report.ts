import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import {
  createDatabaseConnection,
  persons,
  sourceProfiles,
  evidenceItems,
  searchDocuments,
  sql,
  eq
} from "@seeku/db";

async function main() {
  const { db, close } = createDatabaseConnection();

  try {
    const [personCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(persons);

    const [sourceProfileCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceProfiles)
      .where(eq(sourceProfiles.isDeleted, false));

    const [bonjourCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceProfiles)
      .where(sql`${sourceProfiles.source} = 'bonjour' AND ${sourceProfiles.isDeleted} = false`);

    const [githubCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceProfiles)
      .where(sql`${sourceProfiles.source} = 'github' AND ${sourceProfiles.isDeleted} = false`);

    const [evidenceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(evidenceItems);

    const [searchDocCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(searchDocuments);

    const evidencePerPerson = await db.execute(sql`
      SELECT
        CASE
          WHEN evidence_count = 0 THEN '0'
          WHEN evidence_count BETWEEN 1 AND 3 THEN '1-3'
          WHEN evidence_count BETWEEN 4 AND 10 THEN '4-10'
          ELSE '10+'
        END AS bucket,
        count(*) AS person_count
      FROM (
        SELECT p.id, count(e.id)::int AS evidence_count
        FROM persons p
        LEFT JOIN evidence_items e ON e.person_id = p.id
        GROUP BY p.id
      ) sub
      GROUP BY bucket
      ORDER BY bucket
    `);

    const facetCoverage = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE facet_role IS NOT NULL AND array_length(facet_role, 1) > 0) AS has_role,
        count(*) FILTER (WHERE facet_tags IS NOT NULL AND array_length(facet_tags, 1) > 0) AS has_tags,
        count(*) FILTER (WHERE facet_location IS NOT NULL AND array_length(facet_location, 1) > 0) AS has_location,
        count(*) AS total
      FROM search_documents
    `);

    console.log("=== Seeku Data Quality Coverage Report ===\n");
    console.log(`Persons:          ${personCount.count}`);
    console.log(`Source Profiles:  ${sourceProfileCount.count}`);
    console.log(`  Bonjour:        ${bonjourCount.count}`);
    console.log(`  GitHub:         ${githubCount.count}`);
    console.log(`Evidence Items:   ${evidenceCount.count}`);
    console.log(`Search Documents: ${searchDocCount.count}`);

    console.log("\n--- Evidence per Person ---");
    for (const row of evidencePerPerson) {
      console.log(`  ${(row as any).bucket} items: ${(row as any).person_count} persons`);
    }

    if (facetCoverage.length > 0) {
      const fc = facetCoverage[0] as any;
      console.log("\n--- Search Document Facet Coverage ---");
      console.log(`  Total docs:     ${fc.total}`);
      console.log(`  Has role:       ${fc.has_role} (${((fc.has_role / fc.total) * 100).toFixed(1)}%)`);
      console.log(`  Has tags:       ${fc.has_tags} (${((fc.has_tags / fc.total) * 100).toFixed(1)}%)`);
      console.log(`  Has location:   ${fc.has_location} (${((fc.has_location / fc.total) * 100).toFixed(1)}%)`);
    }

    const personsWithoutSearch = await db.execute(sql`
      SELECT count(*) AS count
      FROM persons p
      WHERE NOT EXISTS (SELECT 1 FROM search_documents sd WHERE sd.person_id = p.id)
    `);
    console.log(`\n--- Gaps ---`);
    console.log(`  Persons without search doc: ${(personsWithoutSearch[0] as any).count}`);

    const personsWithoutEvidence = await db.execute(sql`
      SELECT count(*) AS count
      FROM persons p
      WHERE NOT EXISTS (SELECT 1 FROM evidence_items e WHERE e.person_id = p.id)
    `);
    console.log(`  Persons without evidence:   ${(personsWithoutEvidence[0] as any).count}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
