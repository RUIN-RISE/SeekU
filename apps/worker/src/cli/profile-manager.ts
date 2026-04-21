import type { EvidenceItem, Person, ProfileCacheRepository } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { createHash } from "node:crypto";
import chalk from "chalk";
import type { Ora } from "ora";
import type { MultiDimensionProfile, SearchConditions } from "./types.js";
import { CLI_CONFIG } from "./config.js";
import { HybridScoringEngine } from "./scorer.js";
import { ProfileGenerator } from "./profile-generator.js";
import { withRetry } from "./retry.js";

export interface ProfileLoadableCandidate {
  personId: string;
  name: string;
  profile?: MultiDimensionProfile;
  _hydrated: {
    person: Person;
    evidence: EvidenceItem[];
  };
}

export interface ProfileManagerDependencies {
  cacheRepo: ProfileCacheRepository;
  scorer: HybridScoringEngine;
  generator: ProfileGenerator;
  getSpinner: () => Ora;
}

export class ProfileManager {
  private processingProfiles = new Map<string, Promise<MultiDimensionProfile>>();

  constructor(private deps: ProfileManagerDependencies) {}

  buildProfileCacheKey(conditions: SearchConditions): string {
    const normalizeArray = (items: string[]) =>
      items
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .sort();

    const payload = {
      skills: normalizeArray(conditions.skills),
      locations: normalizeArray(conditions.locations),
      experience: conditions.experience?.trim().toLowerCase() ?? "",
      role: conditions.role?.trim().toLowerCase() ?? "",
      sourceBias: conditions.sourceBias ?? "",
      mustHave: normalizeArray(conditions.mustHave),
      niceToHave: normalizeArray(conditions.niceToHave),
      exclude: normalizeArray(conditions.exclude),
      preferFresh: conditions.preferFresh,
      candidateAnchor: {
        shortlistIndex: conditions.candidateAnchor?.shortlistIndex ?? "",
        personId: conditions.candidateAnchor?.personId?.trim().toLowerCase() ?? "",
        name: conditions.candidateAnchor?.name?.trim().toLowerCase() ?? ""
      }
    };

    return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  }

  async ensureProfiles(
    candidates: ProfileLoadableCandidate[],
    conditions: SearchConditions,
    loadingText: string
  ): Promise<void> {
    const targets = candidates.filter((candidate) => !candidate.profile);
    if (targets.length === 0) {
      return;
    }

    const spinner = this.deps.getSpinner();
    spinner.start(loadingText);
    try {
      await Promise.all(targets.map((candidate) => this.loadProfileForCandidate(candidate, conditions)));
      spinner.stop();
    } catch (error) {
      spinner.fail("画像准备失败。");
      throw error;
    }
  }

  async loadProfileForCandidate(
    candidate: ProfileLoadableCandidate,
    conditions: SearchConditions
  ): Promise<MultiDimensionProfile | null> {
    const { person, evidence } = candidate._hydrated;
    const profileCacheKey = this.buildProfileCacheKey(conditions);
    const processingKey = `${candidate.personId}:${profileCacheKey}`;
    const spinner = this.deps.getSpinner();

    try {
      const isCached = await this.deps.cacheRepo.getProfile(candidate.personId, profileCacheKey);
      const isPreloading = this.processingProfiles.has(processingKey);

      if (!isCached && !isPreloading && !spinner.isSpinning) {
        spinner.start(`正在分析 ${candidate.name}...`);
      } else if (isPreloading && !spinner.isSpinning) {
        spinner.start(`等待后台完成 ${candidate.name} 的分析...`);
      }

      const profile = await this.getOrGenerateProfile(candidate.personId, person, evidence, conditions);
      candidate.profile = profile;

      if (spinner.isSpinning && !isCached && !isPreloading) {
        spinner.succeed("画像分析完成。");
      } else if (spinner.isSpinning) {
        spinner.stop();
      }

      return profile;
    } catch (error) {
      if (spinner.isSpinning) {
        spinner.fail("画像分析失败。");
      }
      console.error(chalk.red("   Error detail:"), error instanceof Error ? error.message : "Analysis failed");
      return null;
    }
  }

  async getOrGenerateProfile(
    personId: string,
    person: Person,
    evidence: EvidenceItem[],
    conditions: SearchConditions,
    options: {
      quiet?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<MultiDimensionProfile> {
    const profileCacheKey = this.buildProfileCacheKey(conditions);
    const processingKey = `${personId}:${profileCacheKey}`;

    let profile = await this.deps.cacheRepo.getProfile(personId, profileCacheKey);
    if (profile) {
      return profile;
    }

    if (this.processingProfiles.has(processingKey)) {
      const existing = this.processingProfiles.get(processingKey);
      if (existing) {
        const isRejected = await existing.then(
          () => false,
          () => true
        );
        if (!isRejected) {
          return existing;
        }
      }

      this.processingProfiles.delete(processingKey);
    }

    const generateTask = async () =>
      withRetry(async () => {
        let innerProfile = await this.deps.cacheRepo.getProfile(personId, profileCacheKey);
        if (innerProfile) {
          return innerProfile;
        }

        const rules = this.deps.scorer.scoreByRules(person, evidence, conditions);
        const llm = await this.deps.scorer.scoreByLLM(person, evidence, {
          quiet: options.quiet,
          maxRetries: options.maxRetries
        });
        const experienceBonus = this.deps.scorer.calculateExperienceMatch(person, evidence, conditions);
        innerProfile = this.deps.scorer.aggregate(rules, llm, experienceBonus);

        innerProfile = await this.deps.generator.generate(person, evidence, innerProfile, conditions, {
          quiet: options.quiet,
          maxRetries: options.maxRetries
        });
        await this.deps.cacheRepo.setProfile(personId, profileCacheKey, innerProfile, innerProfile.overallScore);

        return innerProfile;
      }, { maxRetries: CLI_CONFIG.llm.maxRetries, baseDelay: 2000 });

    const promise = generateTask().finally(() => {
      this.processingProfiles.delete(processingKey);
    });

    const timeoutId = setTimeout(() => {
      if (this.processingProfiles.get(processingKey) === promise) {
        this.processingProfiles.delete(processingKey);
      }
    }, 30 * 60 * 1000);

    if (typeof timeoutId.unref === "function") {
      timeoutId.unref();
    }

    this.processingProfiles.set(processingKey, promise);
    return promise;
  }

  async preloadProfiles(
    candidates: ProfileLoadableCandidate[],
    conditions: SearchConditions
  ): Promise<void> {
    const tasks: Array<() => Promise<void>> = [];

    for (const candidate of candidates) {
      tasks.push(async () => {
        const { person, evidence } = candidate._hydrated;
        const profile = await this.getOrGenerateProfile(candidate.personId, person, evidence, conditions, {
          quiet: true,
          maxRetries: 0
        });
        candidate.profile = profile;
      });
    }

    if (tasks.length > 0) {
      await this.promisePool(tasks, CLI_CONFIG.llm.parallelLimit);
    }
  }

  shouldPreloadProfiles(): boolean {
    return !process.stdin.isTTY;
  }

  private async promisePool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    type PoolResult = T | { error: Error };
    const results: PoolResult[] = new Array(tasks.length);

    const runWorker = async (startIndex: number): Promise<void> => {
      for (let index = startIndex; index < tasks.length; index += limit) {
        try {
          results[index] = await tasks[index]();
        } catch (error) {
          results[index] = { error: error instanceof Error ? error : new Error(String(error)) };
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, (_, index) => runWorker(index));
    await Promise.all(workers);

    const successful = results.filter(
      (result): result is T => !(result && typeof result === "object" && "error" in result)
    );
    const failed = results.filter(
      (result): result is { error: Error } => Boolean(result && typeof result === "object" && "error" in result)
    );

    if (failed.length > 0) {
      console.warn(chalk.dim(`\n[Pool Warning] ${failed.length} analysis tasks failed. Results may be incomplete.`));
    }

    return successful;
  }
}
