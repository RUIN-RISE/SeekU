import { sql } from "drizzle-orm";

export const initialSchemaStatements = [
  sql`create extension if not exists "uuid-ossp";`,
  sql`create extension if not exists vector;`,
  sql`create extension if not exists pg_trgm;`,
  sql`
    create type source_name as enum ('bonjour', 'github');
  `,
  sql`
    create type sync_status as enum ('running', 'succeeded', 'failed', 'partial');
  `
];
