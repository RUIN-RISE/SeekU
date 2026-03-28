import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./repositories.js";

export type SeekuDatabase = PostgresJsDatabase<typeof schema>;

export function createPostgresClient(connectionString: string = process.env.DATABASE_URL ?? "") {
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to create a database client.");
  }

  return postgres(connectionString, {
    prepare: false,
    max: 1
  });
}

export function createDatabaseClient(connectionString: string = process.env.DATABASE_URL ?? "") {
  const client = createPostgresClient(connectionString);
  return drizzle(client, { schema });
}

export function createDatabase(connectionString?: string) {
  return createDatabaseClient(connectionString);
}

export const getDatabase = createDatabase;

export function createDatabaseConnection(connectionString: string = process.env.DATABASE_URL ?? "") {
  const client = createPostgresClient(connectionString);
  const db = drizzle(client, { schema });

  return {
    client,
    db,
    close: async () => {
      await client.end();
    }
  };
}
