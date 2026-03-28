import type { DiscoverResult, SourceSeed } from "../types.js";
import type {
  BonjourCategory,
  BonjourCommunityPost,
  BonjourProfileReference
} from "./client.js";
import { BonjourClient } from "./client.js";

const DEFAULT_CATEGORY_PAGE_SIZE = 10;
const MAX_EXPANSION_LINKS = 3;

export interface BonjourDiscoverCursor {
  categoryIndex?: number;
  skip?: number;
}

function sortCategories(categories: BonjourCategory[]) {
  return [...categories].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

function toSeed(reference: BonjourProfileReference, context: Record<string, unknown>): SourceSeed {
  return {
    handle: reference.profile_link,
    rawPayload: {
      ...context,
      profile: reference
    }
  };
}

function appendUniqueSeeds(
  target: SourceSeed[],
  seenHandles: Set<string>,
  references: BonjourProfileReference[],
  context: Record<string, unknown>,
  limit: number
) {
  for (const reference of references) {
    if (target.length >= limit) {
      return;
    }

    if (!reference.profile_link || seenHandles.has(reference.profile_link)) {
      continue;
    }

    seenHandles.add(reference.profile_link);
    target.push(toSeed(reference, context));
  }
}

export function extractSeedProfilesFromCommunity(posts: BonjourCommunityPost[]) {
  return posts.flatMap((post) => post.profile_link ?? []);
}

export async function discoverBonjourSeeds(
  client: BonjourClient,
  input: {
    cursor?: Record<string, unknown>;
    limit: number;
  }
): Promise<DiscoverResult> {
  const categories = sortCategories(await client.fetchCategories());
  const cursor = (input.cursor ?? {}) as BonjourDiscoverCursor;
  const seenHandles = new Set<string>();
  const profiles: SourceSeed[] = [];

  let categoryIndex = cursor.categoryIndex ?? 0;
  let skip = cursor.skip ?? 0;
  let nextCursor: Record<string, unknown> | undefined;

  while (categoryIndex < categories.length && profiles.length < input.limit) {
    const category = categories[categoryIndex];
    const pageSize = Math.max(DEFAULT_CATEGORY_PAGE_SIZE, input.limit);
    const posts = await client.fetchCommunityPostsByCategory(category.key, pageSize, skip);
    const references = extractSeedProfilesFromCommunity(posts);

    appendUniqueSeeds(
      profiles,
      seenHandles,
      references,
      { discoveredVia: "category", categoryKey: category.key, skip },
      input.limit
    );

    const expansionCandidates = references.slice(0, MAX_EXPANSION_LINKS);
    for (const reference of expansionCandidates) {
      if (profiles.length >= input.limit) {
        break;
      }

      const neighborPosts = await client.fetchCommunityPostsByProfileLink(reference.profile_link, 5, 0);
      appendUniqueSeeds(
        profiles,
        seenHandles,
        extractSeedProfilesFromCommunity(neighborPosts),
        {
          discoveredVia: "profile_link",
          originProfileLink: reference.profile_link
        },
        input.limit
      );
    }

    if (posts.length === pageSize) {
      nextCursor = {
        categoryIndex,
        skip: skip + pageSize
      };
      break;
    }

    categoryIndex += 1;
    skip = 0;

    if (profiles.length >= input.limit) {
      nextCursor = {
        categoryIndex,
        skip
      };
      break;
    }
  }

  const hasMore = nextCursor !== undefined || categoryIndex < categories.length;

  return {
    profiles,
    nextCursor,
    hasMore
  };
}
