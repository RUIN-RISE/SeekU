import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  BonjourClient,
  type BonjourCategory,
  type BonjourCommunityComment,
  type BonjourCommunityPost,
  type BonjourProfile
} from "./client.js";

type DumpBonjourHandleSourceKind =
  | "category"
  | "global_timeline"
  | "profile_timeline"
  | "post_comment"
  | "post_like"
  | "external_import";

export interface DumpBonjourImportedHandleSource {
  label: string;
  handles: string[];
  metadata?: Record<string, unknown>;
}

export interface DumpBonjourRawOptions {
  outputDir: string;
  client?: BonjourClient;
  profileClients?: BonjourClient[];
  commentClients?: BonjourClient[];
  timelineClients?: BonjourClient[];
  pageSize?: number;
  maxPagesPerCategory?: number;
  scanCategoryTimeline?: boolean;
  profileLimit?: number;
  fetchProfiles?: boolean;
  inflateProfiles?: boolean;
  scanGlobalTimeline?: boolean;
  scanPostComments?: boolean;
  scanImportedProfileTimelines?: boolean;
  globalTimelinePageSize?: number;
  maxGlobalTimelinePages?: number;
  profileTimelinePageSize?: number;
  maxProfileTimelinePages?: number;
  importedHandleSources?: DumpBonjourImportedHandleSource[];
}

export interface DumpBonjourHandleSummary {
  handle: string;
  occurrences: number;
  categories: string[];
  categoryTitles: string[];
  profileNames: string[];
  profileDescriptions: string[];
  sourceKinds: DumpBonjourHandleSourceKind[];
  externalSources: string[];
}

export interface DumpBonjourCommunityPageRecord {
  scope: "category" | "global_timeline" | "profile_timeline";
  categoryKey?: string;
  categoryTitle?: string;
  profileHandle?: string;
  pageIndex: number;
  skip: number;
  limit: number;
  postCount: number;
  filePath: string;
}

export interface DumpBonjourImportedHandleSourceRecord {
  label: string;
  handleCount: number;
  uniqueHandleCount: number;
  newHandleCount: number;
  filePath: string;
  metadata?: Record<string, unknown>;
}

export interface DumpBonjourCommentPageRecord {
  postId: string;
  commentCount: number;
  categoryKeys: string[];
  categoryTitles: string[];
  filePath: string;
}

export interface DumpBonjourProfileRecord {
  handle: string;
  filePath?: string;
  inflationRequired: boolean;
  inflated: boolean;
  inflateError?: string;
  error?: string;
}

export interface DumpBonjourRawResult {
  outputDir: string;
  pageSize: number;
  maxPagesPerCategory: number | null;
  scanCategoryTimeline: boolean;
  scanGlobalTimeline: boolean;
  scanPostComments: boolean;
  scanImportedProfileTimelines: boolean;
  globalTimelinePageSize: number;
  maxGlobalTimelinePages: number | null;
  profileTimelinePageSize: number;
  maxProfileTimelinePages: number | null;
  categoriesScanned: number;
  totalCategories: number;
  categoryCommunityPagesScanned: number;
  categoryPostsScanned: number;
  globalTimelinePagesScanned: number;
  globalTimelinePostsScanned: number;
  profileTimelineHandlesScanned: number;
  profileTimelinePagesScanned: number;
  profileTimelinePostsScanned: number;
  commentThreadsScanned: number;
  commentRowsScanned: number;
  communityPagesScanned: number;
  postsScanned: number;
  uniqueHandles: number;
  importedHandleCount: number;
  importedHandleSourceCount: number;
  profilesDumped: number;
  inflatedProfiles: number;
  communityIndexPath: string;
  handlesPath: string;
  importedHandlesIndexPath?: string;
  commentIndexPath?: string;
  profilesIndexPath?: string;
  manifestPath: string;
  truncatedCategories: Array<{
    key: string;
    title: string;
    pagesScanned: number;
    postsScanned: number;
  }>;
}

interface HandleAccumulator {
  handle: string;
  occurrences: number;
  categories: Set<string>;
  categoryTitles: Set<string>;
  profileNames: Set<string>;
  profileDescriptions: Set<string>;
  sourceKinds: Set<DumpBonjourHandleSourceKind>;
  externalSources: Set<string>;
}

interface CommentThreadAccumulator {
  postId: string;
  categories: Map<string, string>;
}

function sortCategories(categories: BonjourCategory[]) {
  return [...categories].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

function sanitizePathSegment(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized.length > 0 ? normalized : "unknown";
}

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonFile(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toPrettyJson(value), "utf8");
}

function getOrCreateHandleAccumulator(
  accumulators: Map<string, HandleAccumulator>,
  handle: string
) {
  let accumulator = accumulators.get(handle);
  if (!accumulator) {
    accumulator = {
      handle,
      occurrences: 0,
      categories: new Set<string>(),
      categoryTitles: new Set<string>(),
      profileNames: new Set<string>(),
      profileDescriptions: new Set<string>(),
      sourceKinds: new Set<DumpBonjourHandleSourceKind>(),
      externalSources: new Set<string>()
    };
    accumulators.set(handle, accumulator);
  }

  return accumulator;
}

function collectPostCategories(
  post: BonjourCommunityPost,
  fallbackCategory?: Pick<BonjourCategory, "key" | "title">
) {
  const categories = new Map<string, string>();

  for (const category of post.category ?? []) {
    const key = category.key?.trim();
    if (!key) {
      continue;
    }

    categories.set(key, category.title?.trim() || key);
  }

  if (fallbackCategory?.key?.trim()) {
    categories.set(
      fallbackCategory.key.trim(),
      fallbackCategory.title?.trim() || fallbackCategory.key.trim()
    );
  }

  return [...categories.entries()].map(([key, title]) => ({ key, title }));
}

function recordHandlesFromPosts(
  accumulators: Map<string, HandleAccumulator>,
  posts: BonjourCommunityPost[],
  sourceKind: DumpBonjourHandleSourceKind,
  fallbackCategory?: Pick<BonjourCategory, "key" | "title">
) {
  for (const post of posts) {
    const categories = collectPostCategories(post, fallbackCategory);

    for (const reference of post.profile_link ?? []) {
      const handle = reference.profile_link?.trim();
      if (!handle) {
        continue;
      }

      const accumulator = getOrCreateHandleAccumulator(accumulators, handle);
      accumulator.occurrences += 1;
      accumulator.sourceKinds.add(sourceKind);

      for (const category of categories) {
        accumulator.categories.add(category.key);
        accumulator.categoryTitles.add(category.title);
      }

      if (reference.name?.trim()) {
        accumulator.profileNames.add(reference.name.trim());
      }

      if (reference.description?.trim()) {
        accumulator.profileDescriptions.add(reference.description.trim());
      }
    }
  }
}

function recordLikeHandlesFromPosts(
  accumulators: Map<string, HandleAccumulator>,
  posts: BonjourCommunityPost[],
  fallbackCategory?: Pick<BonjourCategory, "key" | "title">
) {
  for (const post of posts) {
    const categories = collectPostCategories(post, fallbackCategory);

    for (const likedHandle of post.like ?? []) {
      const handle = likedHandle?.trim();
      if (!handle) {
        continue;
      }

      const accumulator = getOrCreateHandleAccumulator(accumulators, handle);
      accumulator.occurrences += 1;
      accumulator.sourceKinds.add("post_like");

      for (const category of categories) {
        accumulator.categories.add(category.key);
        accumulator.categoryTitles.add(category.title);
      }
    }
  }
}

function recordCommentHandlesFromComments(
  accumulators: Map<string, HandleAccumulator>,
  comments: BonjourCommunityComment[],
  categories: Array<{ key: string; title: string }>
) {
  for (const comment of comments) {
    const handle = comment.profile_link?.trim();
    if (!handle) {
      continue;
    }

    const accumulator = getOrCreateHandleAccumulator(accumulators, handle);
    accumulator.occurrences += 1;
    accumulator.sourceKinds.add("post_comment");

    for (const category of categories) {
      accumulator.categories.add(category.key);
      accumulator.categoryTitles.add(category.title);
    }

    if (comment.profile?.name?.trim()) {
      accumulator.profileNames.add(comment.profile.name.trim());
    }

    if (comment.profile?.description?.trim()) {
      accumulator.profileDescriptions.add(comment.profile.description.trim());
    }
  }
}

function queueCommentThread(
  accumulators: Map<string, CommentThreadAccumulator>,
  post: BonjourCommunityPost,
  fallbackCategory?: Pick<BonjourCategory, "key" | "title">
) {
  if ((post.comments?.length ?? 0) === 0 || !post._id) {
    return;
  }

  let accumulator = accumulators.get(post._id);
  if (!accumulator) {
    accumulator = {
      postId: post._id,
      categories: new Map<string, string>()
    };
    accumulators.set(post._id, accumulator);
  }

  for (const category of collectPostCategories(post, fallbackCategory)) {
    accumulator.categories.set(category.key, category.title);
  }
}

function recordImportedHandles(
  accumulators: Map<string, HandleAccumulator>,
  importedHandleSources: DumpBonjourImportedHandleSource[]
) {
  const importRecords: DumpBonjourImportedHandleSourceRecord[] = [];
  const globalImportedHandles = new Set<string>();

  for (const source of importedHandleSources) {
    const uniqueHandles = [...new Set(source.handles.map((handle) => handle.trim()).filter(Boolean))];
    let newHandleCount = 0;

    for (const handle of uniqueHandles) {
      const alreadyKnown = accumulators.has(handle);
      const accumulator = getOrCreateHandleAccumulator(accumulators, handle);
      accumulator.sourceKinds.add("external_import");
      accumulator.externalSources.add(source.label);
      globalImportedHandles.add(handle);

      if (!alreadyKnown) {
        newHandleCount += 1;
      }
    }

    importRecords.push({
      label: source.label,
      handleCount: source.handles.length,
      uniqueHandleCount: uniqueHandles.length,
      newHandleCount,
      filePath: "",
      metadata: source.metadata
    });
  }

  return {
    importedHandleCount: globalImportedHandles.size,
    importRecords
  };
}

function toHandleSummary(accumulator: HandleAccumulator): DumpBonjourHandleSummary {
  return {
    handle: accumulator.handle,
    occurrences: accumulator.occurrences,
    categories: [...accumulator.categories],
    categoryTitles: [...accumulator.categoryTitles],
    profileNames: [...accumulator.profileNames],
    profileDescriptions: [...accumulator.profileDescriptions],
    sourceKinds: [...accumulator.sourceKinds].sort(),
    externalSources: [...accumulator.externalSources].sort()
  };
}

function getUniqueImportedHandles(importedHandleSources: DumpBonjourImportedHandleSource[]) {
  return [
    ...new Set(
      importedHandleSources.flatMap((source) =>
        source.handles.map((handle) => handle.trim()).filter(Boolean)
      )
    )
  ].sort((left, right) => left.localeCompare(right));
}

function compareHandleSummary(left: DumpBonjourHandleSummary, right: DumpBonjourHandleSummary) {
  return right.occurrences - left.occurrences || left.handle.localeCompare(right.handle);
}

async function fetchProfileWithOptionalInflation(
  client: BonjourClient,
  handle: string,
  inflateProfiles: boolean
): Promise<{
  profile: BonjourProfile;
  inflationRequired: boolean;
  inflated: boolean;
  inflateError?: string;
}> {
  const profile = await client.fetchProfileByHandle(handle);
  const inflationRequired = Boolean(profile.inflationRequired);

  if (!inflateProfiles || !inflationRequired) {
    return {
      profile,
      inflationRequired,
      inflated: false
    };
  }

  try {
    const inflatedProfile = await client.fetchProfileByHandle(handle, { inflate: true });
    return {
      profile: inflatedProfile,
      inflationRequired,
      inflated: true
    };
  } catch (error) {
    return {
      profile,
      inflationRequired,
      inflated: false,
      inflateError: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizePageLimit(value: number | undefined, fallback: number) {
  return Math.max(1, value ?? fallback);
}

function normalizeMaxPages(value: number | undefined) {
  return value === undefined || value <= 0 ? null : value;
}

export async function dumpBonjourRawData(
  options: DumpBonjourRawOptions
): Promise<DumpBonjourRawResult> {
  const client = options.client ?? new BonjourClient();
  const outputDir = resolve(options.outputDir);
  const pageSize = normalizePageLimit(options.pageSize, 100);
  const maxPagesPerCategory = normalizeMaxPages(options.maxPagesPerCategory);
  const scanCategoryTimeline = options.scanCategoryTimeline ?? true;
  const fetchProfiles = options.fetchProfiles ?? true;
  const inflateProfiles = options.inflateProfiles ?? true;
  const scanGlobalTimeline = options.scanGlobalTimeline ?? false;
  const scanPostComments = options.scanPostComments ?? false;
  const scanImportedProfileTimelines = options.scanImportedProfileTimelines ?? false;
  const globalTimelinePageSize = normalizePageLimit(options.globalTimelinePageSize, 100);
  const maxGlobalTimelinePages = normalizeMaxPages(options.maxGlobalTimelinePages);
  const profileTimelinePageSize = normalizePageLimit(options.profileTimelinePageSize, 20);
  const maxProfileTimelinePages = normalizeMaxPages(options.maxProfileTimelinePages);
  const importedHandleSources = options.importedHandleSources ?? [];
  const importedHandles = getUniqueImportedHandles(importedHandleSources);

  await mkdir(outputDir, { recursive: true });

  const categories = scanCategoryTimeline ? sortCategories(await client.fetchCategories()) : [];
  const categoriesPath = resolve(outputDir, "categories.json");
  await writeJsonFile(categoriesPath, categories);

  const handleAccumulators = new Map<string, HandleAccumulator>();
  const commentThreadAccumulators = new Map<string, CommentThreadAccumulator>();
  const communityIndex: DumpBonjourCommunityPageRecord[] = [];
  const truncatedCategories: DumpBonjourRawResult["truncatedCategories"] = [];

  let categoriesScanned = 0;
  let categoryCommunityPagesScanned = 0;
  let categoryPostsScanned = 0;

  if (scanCategoryTimeline) {
    for (const category of categories) {
      let skip = 0;
      let pageIndex = 0;
      let categoryLocalPostsScanned = 0;

      while (true) {
        if (maxPagesPerCategory !== null && pageIndex >= maxPagesPerCategory) {
          truncatedCategories.push({
            key: category.key,
            title: category.title,
            pagesScanned: pageIndex,
            postsScanned: categoryLocalPostsScanned
          });
          break;
        }

        const posts = await client.fetchCommunityPostsByCategory(category.key, pageSize, skip);
        if (posts.length === 0) {
          break;
        }

        if (pageIndex === 0) {
          categoriesScanned += 1;
        }

        const communityFileName = `${String(pageIndex).padStart(4, "0")}-skip-${skip}.json`;
        const communityFilePath = resolve(
          outputDir,
          "community",
          sanitizePathSegment(category.key),
          communityFileName
        );
        await writeJsonFile(communityFilePath, posts);

        communityIndex.push({
          scope: "category",
          categoryKey: category.key,
          categoryTitle: category.title,
          pageIndex,
          skip,
          limit: pageSize,
          postCount: posts.length,
          filePath: relative(outputDir, communityFilePath)
        });

        recordHandlesFromPosts(handleAccumulators, posts, "category", category);
        recordLikeHandlesFromPosts(handleAccumulators, posts, category);
        if (scanPostComments) {
          for (const post of posts) {
            queueCommentThread(commentThreadAccumulators, post, category);
          }
        }

        pageIndex += 1;
        categoryCommunityPagesScanned += 1;
        categoryPostsScanned += posts.length;
        categoryLocalPostsScanned += posts.length;
        skip += posts.length;
      }
    }
  }

  let globalTimelinePagesScanned = 0;
  let globalTimelinePostsScanned = 0;

  if (scanGlobalTimeline) {
    let skip = 0;
    let pageIndex = 0;

    while (true) {
      if (maxGlobalTimelinePages !== null && pageIndex >= maxGlobalTimelinePages) {
        break;
      }

      const posts = await client.fetchGlobalCommunityPosts(globalTimelinePageSize, skip);
      if (posts.length === 0) {
        break;
      }

      const communityFileName = `${String(pageIndex).padStart(4, "0")}-skip-${skip}.json`;
      const communityFilePath = resolve(
        outputDir,
        "community",
        "__global_timeline__",
        communityFileName
      );
      await writeJsonFile(communityFilePath, posts);

      communityIndex.push({
        scope: "global_timeline",
        pageIndex,
        skip,
        limit: globalTimelinePageSize,
        postCount: posts.length,
        filePath: relative(outputDir, communityFilePath)
      });

      recordHandlesFromPosts(handleAccumulators, posts, "global_timeline");
      recordLikeHandlesFromPosts(handleAccumulators, posts);
      if (scanPostComments) {
        for (const post of posts) {
          queueCommentThread(commentThreadAccumulators, post);
        }
      }

      pageIndex += 1;
      globalTimelinePagesScanned += 1;
      globalTimelinePostsScanned += posts.length;
      skip += posts.length;
    }
  }

  let profileTimelineHandlesScanned = 0;
  let profileTimelinePagesScanned = 0;
  let profileTimelinePostsScanned = 0;

  if (scanImportedProfileTimelines && importedHandles.length > 0) {
    const timelineClients =
      options.timelineClients && options.timelineClients.length > 0 ? options.timelineClients : [client];
    let nextImportedHandleIndex = 0;

    const workers = timelineClients.map((timelineClient) =>
      (async () => {
        while (true) {
          const currentIndex = nextImportedHandleIndex;
          nextImportedHandleIndex += 1;

          if (currentIndex >= importedHandles.length) {
            return;
          }

          const handle = importedHandles[currentIndex]!;
          let skip = 0;
          let pageIndex = 0;
          let handleHasPosts = false;

          while (true) {
            if (maxProfileTimelinePages !== null && pageIndex >= maxProfileTimelinePages) {
              break;
            }

            const posts = await timelineClient.fetchCommunityPostsByProfileLink(
              handle,
              profileTimelinePageSize,
              skip
            );
            if (posts.length === 0) {
              break;
            }

            handleHasPosts = true;
            const communityFileName = `${String(pageIndex).padStart(4, "0")}-skip-${skip}.json`;
            const communityFilePath = resolve(
              outputDir,
              "community",
              "__profile_timeline__",
              sanitizePathSegment(handle),
              communityFileName
            );
            await writeJsonFile(communityFilePath, posts);

            communityIndex.push({
              scope: "profile_timeline",
              profileHandle: handle,
              pageIndex,
              skip,
              limit: profileTimelinePageSize,
              postCount: posts.length,
              filePath: relative(outputDir, communityFilePath)
            });

            recordHandlesFromPosts(handleAccumulators, posts, "profile_timeline");
            recordLikeHandlesFromPosts(handleAccumulators, posts);
            if (scanPostComments) {
              for (const post of posts) {
                queueCommentThread(commentThreadAccumulators, post);
              }
            }

            pageIndex += 1;
            profileTimelinePagesScanned += 1;
            profileTimelinePostsScanned += posts.length;
            skip += posts.length;
          }

          if (handleHasPosts) {
            profileTimelineHandlesScanned += 1;
          }
        }
      })()
    );

    await Promise.all(workers);
  }

  let commentThreadsScanned = 0;
  let commentRowsScanned = 0;
  let commentIndexPath: string | undefined;

  if (scanPostComments && commentThreadAccumulators.size > 0) {
    const commentThreadQueue = [...commentThreadAccumulators.values()];
    const commentRecords: DumpBonjourCommentPageRecord[] = [];
    const commentClients =
      options.commentClients && options.commentClients.length > 0
        ? options.commentClients
        : [client];
    let nextCommentThreadIndex = 0;

    const workers = commentClients.map((commentClient) =>
      (async () => {
        while (true) {
          const currentIndex = nextCommentThreadIndex;
          nextCommentThreadIndex += 1;

          if (currentIndex >= commentThreadQueue.length) {
            return;
          }

          const thread = commentThreadQueue[currentIndex]!;
          const comments = await commentClient.fetchCommunityCommentsByPostId(thread.postId);
          const commentFilePath = resolve(outputDir, "comments", `${thread.postId}.json`);
          await writeJsonFile(commentFilePath, comments);

          const categories = [...thread.categories.entries()].map(([key, title]) => ({ key, title }));
          recordCommentHandlesFromComments(handleAccumulators, comments, categories);

          commentRecords[currentIndex] = {
            postId: thread.postId,
            commentCount: comments.length,
            categoryKeys: [...thread.categories.keys()],
            categoryTitles: [...thread.categories.values()],
            filePath: relative(outputDir, commentFilePath)
          };
        }
      })()
    );

    await Promise.all(workers);

    commentThreadsScanned = commentRecords.length;
    commentRowsScanned = commentRecords.reduce((sum, record) => sum + record.commentCount, 0);
    commentIndexPath = resolve(outputDir, "comment-index.json");
    await writeJsonFile(commentIndexPath, commentRecords);
  }

  const { importedHandleCount, importRecords } = recordImportedHandles(
    handleAccumulators,
    importedHandleSources
  );

  let importedHandlesIndexPath: string | undefined;
  if (importRecords.length > 0) {
    for (const [index, record] of importRecords.entries()) {
      const importFilePath = resolve(
        outputDir,
        "imports",
        `${String(index).padStart(4, "0")}-${sanitizePathSegment(record.label)}.json`
      );
      const matchingSource = importedHandleSources[index];
      await writeJsonFile(importFilePath, {
        label: record.label,
        handles: [...new Set(matchingSource.handles.map((handle) => handle.trim()).filter(Boolean))],
        metadata: record.metadata ?? null
      });
      record.filePath = relative(outputDir, importFilePath);
    }

    importedHandlesIndexPath = resolve(outputDir, "imported-handles-index.json");
    await writeJsonFile(importedHandlesIndexPath, importRecords);
  }

  const handles = [...handleAccumulators.values()].map(toHandleSummary).sort(compareHandleSummary);
  const handlesPath = resolve(outputDir, "handles.json");
  const communityIndexPath = resolve(outputDir, "community-index.json");
  await writeJsonFile(handlesPath, handles);
  await writeJsonFile(communityIndexPath, communityIndex);

  let profilesDumped = 0;
  let inflatedProfiles = 0;
  let profilesIndexPath: string | undefined;

  if (fetchProfiles) {
    const profileRecords: DumpBonjourProfileRecord[] = [];
    const profileClients =
      options.profileClients && options.profileClients.length > 0
        ? options.profileClients
        : [client];
    const targetHandles =
      options.profileLimit && options.profileLimit > 0
        ? handles.slice(0, options.profileLimit).map((handle) => handle.handle)
        : handles.map((handle) => handle.handle);
    let nextHandleIndex = 0;

    const workers = profileClients.map((profileClient) =>
      (async () => {
        while (true) {
          const currentIndex = nextHandleIndex;
          nextHandleIndex += 1;

          if (currentIndex >= targetHandles.length) {
            return;
          }

          const handle = targetHandles[currentIndex]!;

          try {
            const fetched = await fetchProfileWithOptionalInflation(
              profileClient,
              handle,
              inflateProfiles
            );
            const filePath = resolve(outputDir, "profiles", `${encodeURIComponent(handle)}.json`);
            await writeJsonFile(filePath, fetched.profile);

            profileRecords[currentIndex] = {
              handle,
              filePath: relative(outputDir, filePath),
              inflationRequired: fetched.inflationRequired,
              inflated: fetched.inflated,
              inflateError: fetched.inflateError
            };
          } catch (error) {
            profileRecords[currentIndex] = {
              handle,
              inflationRequired: false,
              inflated: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
      })()
    );

    await Promise.all(workers);

    profilesDumped = profileRecords.filter((record) => Boolean(record?.filePath)).length;
    inflatedProfiles = profileRecords.filter((record) => Boolean(record?.inflated)).length;

    profilesIndexPath = resolve(outputDir, "profiles-index.json");
    await writeJsonFile(profilesIndexPath, profileRecords);
  }

  const communityPagesScanned =
    categoryCommunityPagesScanned + globalTimelinePagesScanned + profileTimelinePagesScanned;
  const postsScanned =
    categoryPostsScanned + globalTimelinePostsScanned + profileTimelinePostsScanned;
  const manifestPath = resolve(outputDir, "manifest.json");

  await writeJsonFile(manifestPath, {
    generatedAt: new Date().toISOString(),
    outputDir,
    categoriesPath: relative(outputDir, categoriesPath),
    communityIndexPath: relative(outputDir, communityIndexPath),
    handlesPath: relative(outputDir, handlesPath),
    importedHandlesIndexPath: importedHandlesIndexPath
      ? relative(outputDir, importedHandlesIndexPath)
      : null,
    commentIndexPath: commentIndexPath ? relative(outputDir, commentIndexPath) : null,
    profilesIndexPath: profilesIndexPath ? relative(outputDir, profilesIndexPath) : null,
    pageSize,
    maxPagesPerCategory,
    scanCategoryTimeline,
    scanGlobalTimeline,
    scanPostComments,
    scanImportedProfileTimelines,
    globalTimelinePageSize,
    maxGlobalTimelinePages,
    profileTimelinePageSize,
    maxProfileTimelinePages,
    fetchProfiles,
    inflateProfiles,
    importedHandleCount,
    importedHandleSourceCount: importedHandleSources.length,
    totalCategories: categories.length,
    categoriesScanned,
    categoryCommunityPagesScanned,
    categoryPostsScanned,
    globalTimelinePagesScanned,
    globalTimelinePostsScanned,
    profileTimelineHandlesScanned,
    profileTimelinePagesScanned,
    profileTimelinePostsScanned,
    commentThreadsScanned,
    commentRowsScanned,
    communityPagesScanned,
    postsScanned,
    uniqueHandles: handles.length,
    profilesDumped,
    inflatedProfiles,
    truncatedCategories
  });

  return {
    outputDir,
    pageSize,
    maxPagesPerCategory,
    scanCategoryTimeline,
    scanGlobalTimeline,
    scanPostComments,
    scanImportedProfileTimelines,
    globalTimelinePageSize,
    maxGlobalTimelinePages,
    profileTimelinePageSize,
    maxProfileTimelinePages,
    totalCategories: categories.length,
    categoriesScanned,
    categoryCommunityPagesScanned,
    categoryPostsScanned,
    globalTimelinePagesScanned,
    globalTimelinePostsScanned,
    profileTimelineHandlesScanned,
    profileTimelinePagesScanned,
    profileTimelinePostsScanned,
    commentThreadsScanned,
    commentRowsScanned,
    communityPagesScanned,
    postsScanned,
    uniqueHandles: handles.length,
    importedHandleCount,
    importedHandleSourceCount: importedHandleSources.length,
    profilesDumped,
    inflatedProfiles,
    communityIndexPath,
    handlesPath,
    importedHandlesIndexPath,
    commentIndexPath,
    profilesIndexPath,
    manifestPath,
    truncatedCategories
  };
}
