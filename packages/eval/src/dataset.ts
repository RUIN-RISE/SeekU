import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import {
  EvalQuery,
  EvalQuerySchema,
  GoldenSetEntry,
  GoldenSetEntrySchema,
} from "./types.js";

function getDatasetPath(filename: string): string {
  return resolve(import.meta.dirname, "..", "datasets", filename);
}

export async function loadQueries(): Promise<EvalQuery[]> {
  const path = getDatasetPath("queries.json");
  const content = await readFile(path, "utf-8");
  const data = JSON.parse(content);
  const schema = z.array(EvalQuerySchema);
  return schema.parse(data);
}

export async function loadGoldenSet(): Promise<GoldenSetEntry[]> {
  const path = getDatasetPath("golden-set.json");
  const content = await readFile(path, "utf-8");
  const data = JSON.parse(content);
  const schema = z.array(GoldenSetEntrySchema);
  return schema.parse(data);
}