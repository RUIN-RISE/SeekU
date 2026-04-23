import type { UserMemoryStore } from "./user-memory-store.js";
import type { UserMemoryContext } from "./user-memory-types.js";

/**
 * Best-effort memory hydration for UI-only enrichment paths.
 *
 * Failure to load memory must not block launcher, preview, or read-only views.
 */
export async function hydrateMemoryContextSafely(
  memoryStore?: Pick<UserMemoryStore, "hydrateContext"> | null
): Promise<UserMemoryContext | null> {
  if (!memoryStore) {
    return null;
  }

  try {
    return await memoryStore.hydrateContext();
  } catch {
    return null;
  }
}
