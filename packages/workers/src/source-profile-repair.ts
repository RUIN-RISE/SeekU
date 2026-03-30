import {
  and,
  coerceJsonObject,
  createDatabaseConnection,
  desc,
  eq,
  inArray,
  sourceProfiles,
  sql,
  type SeekuDatabase,
  type SourceName,
  type SourceProfile
} from "@seeku/db";

export interface SourceProfileRepairOptions {
  source?: SourceName;
  handles?: string[];
  limit?: number;
}

export interface SourceProfileRepairSummary {
  profilesScanned: number;
  profilesUpdated: number;
  rawPayloadRepaired: number;
  normalizedPayloadRepaired: number;
  errors: Array<{ profileId: string; sourceHandle: string; message: string }>;
}

interface RepairCandidate {
  profile: SourceProfile;
  rawPayloadType: string;
  normalizedPayloadType: string;
}

function toJsonbSql(value: unknown) {
  const json = JSON.stringify(coerceJsonObject(value)).replace(/'/g, "''");
  return sql.raw(`'${json}'::jsonb`);
}

async function listProfilesForRepair(
  db: SeekuDatabase,
  options: SourceProfileRepairOptions
): Promise<RepairCandidate[]> {
  const conditions = [];

  if (options.source) {
    conditions.push(eq(sourceProfiles.source, options.source));
  }

  if (options.handles && options.handles.length > 0) {
    conditions.push(inArray(sourceProfiles.sourceHandle, options.handles));
  }

  const query = db
    .select({
      profile: sourceProfiles,
      rawPayloadType: sql<string>`jsonb_typeof(${sourceProfiles.rawPayload})`,
      normalizedPayloadType: sql<string>`jsonb_typeof(${sourceProfiles.normalizedPayload})`
    })
    .from(sourceProfiles);

  const filtered =
    conditions.length > 0
      ? query.where(and(...conditions))
      : query;

  return filtered
    .orderBy(desc(sourceProfiles.lastSyncedAt))
    .limit(options.limit ?? 500);
}

export async function runSourceProfileRepairWorker(
  options: SourceProfileRepairOptions = {},
  db?: SeekuDatabase
): Promise<SourceProfileRepairSummary> {
  const ownedConnection = db ? null : createDatabaseConnection();
  const database = db ?? ownedConnection!.db;

  try {
    const profiles = await listProfilesForRepair(database, options);
    const summary: SourceProfileRepairSummary = {
      profilesScanned: profiles.length,
      profilesUpdated: 0,
      rawPayloadRepaired: 0,
      normalizedPayloadRepaired: 0,
      errors: []
    };

    for (const candidate of profiles) {
      const { profile } = candidate;
      try {
        const rawPayload = coerceJsonObject(profile.rawPayload);
        const normalizedPayload = coerceJsonObject(profile.normalizedPayload);
        const rawNeedsRepair = candidate.rawPayloadType === "string";
        const normalizedNeedsRepair = candidate.normalizedPayloadType === "string";

        if (!rawNeedsRepair && !normalizedNeedsRepair) {
          continue;
        }

        if (rawNeedsRepair && Object.keys(rawPayload).length === 0) {
          throw new Error("raw_payload could not be coerced into an object.");
        }

        if (normalizedNeedsRepair && Object.keys(normalizedPayload).length === 0) {
          throw new Error("normalized_payload could not be coerced into an object.");
        }

        const update: {
          rawPayload?: ReturnType<typeof toJsonbSql>;
          normalizedPayload?: ReturnType<typeof toJsonbSql>;
        } = {};

        if (rawNeedsRepair) {
          update.rawPayload = toJsonbSql(rawPayload);
          summary.rawPayloadRepaired += 1;
        }

        if (normalizedNeedsRepair) {
          update.normalizedPayload = toJsonbSql(normalizedPayload);
          summary.normalizedPayloadRepaired += 1;
        }

        await database
          .update(sourceProfiles)
          .set(update)
          .where(eq(sourceProfiles.id, profile.id));

        summary.profilesUpdated += 1;
      } catch (error) {
        summary.errors.push({
          profileId: profile.id,
          sourceHandle: profile.sourceHandle,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return summary;
  } finally {
    await ownedConnection?.close();
  }
}
