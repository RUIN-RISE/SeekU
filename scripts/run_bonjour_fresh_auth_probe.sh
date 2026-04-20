#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
CAMPAIGN_TAG="${CAMPAIGN_TAG:-bonjour-fresh-auth-probe}"
CAMPAIGN_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$CAMPAIGN_TAG"
LOG_PATH="$CAMPAIGN_DIR/runner.log"
SEED_FILE="${SEED_FILE:-$CAMPAIGN_DIR/fresh-auth-seeds.json}"
SUMMARY_PATH="${SUMMARY_PATH:-$CAMPAIGN_DIR/summary.json}"
AUTO_EXCLUDE_PATH="${AUTO_EXCLUDE_PATH:-$CAMPAIGN_DIR/auto-excludes.json}"
BLOCKED_REASONS_PATH="${BLOCKED_REASONS_PATH:-$CAMPAIGN_DIR/blocked-reasons.json}"
FRESH_INPUT_REPORT_PATH="${FRESH_INPUT_REPORT_PATH:-$CAMPAIGN_DIR/fresh-inputs.json}"
RECENT_SEED_EXCLUDE_PATH="${RECENT_SEED_EXCLUDE_PATH:-$CAMPAIGN_DIR/recent-seed-excludes.json}"
RECENT_SEED_BLOCKED_PATH="${RECENT_SEED_BLOCKED_PATH:-$CAMPAIGN_DIR/recent-seed-blocked-handles.json}"
TOP_BLOCKED_SUMMARY_PATH="${TOP_BLOCKED_SUMMARY_PATH:-$CAMPAIGN_DIR/top-blocked-summary.json}"

FRESH_INPUTS="${FRESH_INPUTS:-}"
HISTORY_INPUTS="${HISTORY_INPUTS:-}"
EXCLUDE_INPUTS="${EXCLUDE_INPUTS:-}"
AUTO_EXCLUDE="${AUTO_EXCLUDE:-1}"
KEYWORDS="${KEYWORDS:-浙大,ZJU,杭州,AI,创业}"
SEED_LIMIT="${SEED_LIMIT:-50}"
SEED_SKIP="${SEED_SKIP:-0}"
SEED_MIN_OCCURRENCES="${SEED_MIN_OCCURRENCES:-1}"
FRESH_INPUT_WINDOW_SECONDS="${FRESH_INPUT_WINDOW_SECONDS:-600}"
FRESH_INPUT_MAX_FILES="${FRESH_INPUT_MAX_FILES:-3}"
RECENT_FRESH_AUTH_SEED_COUNT="${RECENT_FRESH_AUTH_SEED_COUNT:-3}"

PROBE_BATCH_TAG="${PROBE_BATCH_TAG:-${CAMPAIGN_TAG}-probe}"
PROBE_MAX_NODES="${PROBE_MAX_NODES:-300}"
PROBE_CONCURRENCY="${PROBE_CONCURRENCY:-8}"
RUN_EXPAND="${RUN_EXPAND:-1}"

EXPAND_BATCH_TAG="${EXPAND_BATCH_TAG:-${CAMPAIGN_TAG}-expand}"
EXPAND_DEPTH="${EXPAND_DEPTH:-2}"
EXPAND_MAX_NODES="${EXPAND_MAX_NODES:-2000}"
EXPAND_CONCURRENCY="${EXPAND_CONCURRENCY:-4}"

mkdir -p "$CAMPAIGN_DIR"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_PATH"
}

write_summary() {
  "$NODE_BIN" -e '
    const fs = require("fs");

    const campaignTag = process.argv[1];
    const runDate = process.argv[2];
    const summaryPath = process.argv[3];
    const seedFile = process.argv[4];
    const probeDir = process.argv[5];
    const probeRunnerLog = process.argv[6];
    const expandDir = process.argv[7];
    const expandRunnerLog = process.argv[8];
    const deltaRunnerLog = process.argv[9];
    const outcome = process.argv[10];
    const runExpand = process.argv[11] === "1";
    const autoExcludePath = process.argv[12];
    const blockedReasonsPath = process.argv[13];
    const campaignRunnerLog = process.argv[14];
    const freshInputReportPath = process.argv[15];
    const recentSeedExcludePath = process.argv[16];
    const recentSeedBlockedPath = process.argv[17];
    const topBlockedSummaryPath = process.argv[18];

    const readJson = (path) => {
      if (!path || !fs.existsSync(path)) return null;
      try {
        return JSON.parse(fs.readFileSync(path, "utf8"));
      } catch {
        return null;
      }
    };

    const readJsonArrayLength = (path) => {
      const value = readJson(path);
      return Array.isArray(value) ? value.length : 0;
    };

    const extractJsonObjects = (path) => {
      if (!path || !fs.existsSync(path)) return [];
      const text = fs.readFileSync(path, "utf8");
      return [...text.matchAll(/\{\n[\s\S]*?\n\}/g)]
        .map((match) => {
          try {
            return JSON.parse(match[0]);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    };

    const findFilterSummary = (objects) =>
      objects.find((item) => typeof item.inputCount === "number" && typeof item.outputCount === "number") ?? null;

    const findAuthSummary = (objects) =>
      objects.find((item) => typeof item.fetchedNodes === "number" && typeof item.discoveredHandles === "number") ?? null;

    const findImportSummary = (objects) =>
      objects.find((item) => typeof item.processedCount === "number" && item.pipeline) ?? null;

    const findCoverageSummary = (objects) =>
      [...objects].reverse().find((item) => typeof item.totalPersons === "number") ?? null;

    const findSeedBuildSummary = (objects) =>
      objects.find((item) => typeof item.freshInputCount === "number" && typeof item.outputCount === "number") ?? null;

    const buildSeedBlockedReasons = (seedSummary) => {
      if (!seedSummary || typeof seedSummary.mergedUniqueCount !== "number") {
        return null;
      }

      const entries = [
        {
          key: "excludedByFileCount",
          label: "historical_exclude_files",
          description: "Seed candidate already existed in historical import/seed exclude files."
        },
        {
          key: "excludedByMinOccurrencesCount",
          label: "below_min_occurrences",
          description: "Seed candidate did not reach the minimum occurrence threshold."
        },
        {
          key: "excludedByPurePostLikeCount",
          label: "pure_post_like_only",
          description: "Seed candidate only had a post_like signal."
        },
        {
          key: "excludedByMissingNameCount",
          label: "missing_profile_name",
          description: "Seed candidate had no observed profile name."
        },
        {
          key: "excludedByRequiredSourceKindsCount",
          label: "missing_required_source_kind",
          description: "Seed candidate missed at least one required source kind."
        },
        {
          key: "excludedByExcludedSourceKindsCount",
          label: "contains_forbidden_source_kind",
          description: "Seed candidate included a forbidden source kind."
        }
      ]
        .map((entry) => {
          const count = Number(seedSummary[entry.key] ?? 0);
          return {
            stage: "seed",
            key: entry.label,
            description: entry.description,
            count,
            percentage: seedSummary.mergedUniqueCount > 0
              ? Number(((count / seedSummary.mergedUniqueCount) * 100).toFixed(2))
              : 0
          };
        })
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

      return {
        stage: "seed",
        inputCount: seedSummary.mergedUniqueCount,
        outputCount: Number(seedSummary.outputCount ?? 0),
        dominantReason: entries[0] ?? null,
        reasons: entries
      };
    };

    const buildBlockedReasons = (stage, filter) => {
      if (!filter || typeof filter.inputCount !== "number") {
        return null;
      }

      const entries = [
        {
          key: "excludedByDbProfileIdCount",
          label: "existing_db_profile_id",
          description: "Already covered by an existing Bonjour profile id in DB."
        },
        {
          key: "excludedByDbHandleCount",
          label: "existing_db_handle",
          description: "Already covered by an existing Bonjour handle in DB."
        },
        {
          key: "excludedByFileCount",
          label: "historical_exclude_files",
          description: "Removed by historical seed/import exclude files."
        },
        {
          key: "duplicateInputCount",
          label: "duplicate_input",
          description: "Duplicate handles inside the probe/import input."
        },
        {
          key: "collapsedAliasCount",
          label: "collapsed_alias",
          description: "Collapsed into another canonical handle during alias resolution."
        },
        {
          key: "resolveErrorCount",
          label: "resolve_error",
          description: "Profile resolution failed during DB/exclude checks."
        }
      ]
        .map((entry) => {
          const count = Number(filter[entry.key] ?? 0);
          return {
            stage,
            key: entry.label,
            description: entry.description,
            count,
            percentage: filter.inputCount > 0 ? Number(((count / filter.inputCount) * 100).toFixed(2)) : 0
          };
        })
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

      return {
        stage,
        inputCount: filter.inputCount,
        outputCount: Number(filter.outputCount ?? 0),
        dominantReason: entries[0] ?? null,
        reasons: entries
      };
    };

    const sanitizeMatchedExcludeSources = (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const excludeFile = typeof item.excludeFile === "string" ? item.excludeFile : null;
          if (!excludeFile) {
            return [];
          }

          return [{
            sourceType: typeof item.sourceType === "string" ? item.sourceType : "unknown",
            campaignTag: typeof item.campaignTag === "string" ? item.campaignTag : null,
            campaignStage: typeof item.campaignStage === "string" ? item.campaignStage : null,
            excludeFile
          }];
        })
        .sort((left, right) =>
          left.excludeFile.localeCompare(right.excludeFile) ||
          left.sourceType.localeCompare(right.sourceType) ||
          (left.campaignTag ?? "").localeCompare(right.campaignTag ?? "") ||
          (left.campaignStage ?? "").localeCompare(right.campaignStage ?? "")
        );
    };

    const buildTopBlockedSummary = (blockedReport) => {
      const blockedHandles = Array.isArray(blockedReport?.blockedHandles)
        ? blockedReport.blockedHandles.filter((item) => item && typeof item === "object")
        : [];

      const topExcludeFiles = new Map();
      const topCampaignStages = new Map();
      const limitedUniquePush = (list, value, limit = 3) => {
        if (typeof value !== "string" || !value || list.includes(value) || list.length >= limit) {
          return;
        }
        list.push(value);
      };

      const sampleBlockedHandles = blockedHandles
        .slice(0, 5)
        .map((item) => ({
          handle: typeof item.handle === "string" ? item.handle : null,
          name: typeof item.name === "string" ? item.name : null,
          matchedExcludeSources: sanitizeMatchedExcludeSources(item.matchedExcludeSources)
        }))
        .filter((item) => item.handle);

      for (const item of blockedHandles) {
        const handle = typeof item.handle === "string" ? item.handle : null;
        const matchedExcludeSources = sanitizeMatchedExcludeSources(item.matchedExcludeSources);

        for (const source of matchedExcludeSources) {
          const excludeEntry = topExcludeFiles.get(source.excludeFile) ?? {
            excludeFile: source.excludeFile,
            count: 0,
            sourceType: source.sourceType,
            campaignTag: source.campaignTag,
            campaignStage: source.campaignStage,
            sampleHandles: []
          };
          excludeEntry.count += 1;
          limitedUniquePush(excludeEntry.sampleHandles, handle);
          topExcludeFiles.set(source.excludeFile, excludeEntry);

          const campaignStageKey = `${source.campaignTag ?? ""}\u0000${source.campaignStage ?? ""}`;
          const campaignStageEntry = topCampaignStages.get(campaignStageKey) ?? {
            campaignTag: source.campaignTag,
            campaignStage: source.campaignStage,
            count: 0,
            sampleExcludeFiles: []
          };
          campaignStageEntry.count += 1;
          limitedUniquePush(campaignStageEntry.sampleExcludeFiles, source.excludeFile);
          topCampaignStages.set(campaignStageKey, campaignStageEntry);
        }
      }

      const normalizeCountsBySourceType = () => {
        if (
          blockedReport?.blockedHandleCountsBySourceType &&
          typeof blockedReport.blockedHandleCountsBySourceType === "object" &&
          !Array.isArray(blockedReport.blockedHandleCountsBySourceType)
        ) {
          return Object.fromEntries(
            Object.entries(blockedReport.blockedHandleCountsBySourceType)
              .filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]))
              .sort((left, right) => left[0].localeCompare(right[0]))
          );
        }

        return blockedHandles.reduce((acc, item) => {
          const sourceTypes = [...new Set(sanitizeMatchedExcludeSources(item.matchedExcludeSources).map((entry) => entry.sourceType))];
          for (const sourceType of sourceTypes) {
            acc[sourceType] = (acc[sourceType] ?? 0) + 1;
          }
          return acc;
        }, {});
      };

      return {
        recordedAt: new Date().toISOString(),
        campaignTag,
        blockedHandleCount:
          typeof blockedReport?.blockedHandleCount === "number" && Number.isFinite(blockedReport.blockedHandleCount)
            ? blockedReport.blockedHandleCount
            : blockedHandles.length,
        blockedHandleCountsBySourceType: normalizeCountsBySourceType(),
        topExcludeFiles: [...topExcludeFiles.values()].sort((left, right) =>
          right.count - left.count ||
          left.excludeFile.localeCompare(right.excludeFile) ||
          left.sourceType.localeCompare(right.sourceType)
        ),
        topCampaignStages: [...topCampaignStages.values()].sort((left, right) =>
          right.count - left.count ||
          (left.campaignTag ?? "").localeCompare(right.campaignTag ?? "") ||
          (left.campaignStage ?? "").localeCompare(right.campaignStage ?? "")
        ),
        sampleBlockedHandles
      };
    };

    const probeObjects = extractJsonObjects(probeRunnerLog);
    const expandObjects = extractJsonObjects(expandRunnerLog);
    const deltaObjects = extractJsonObjects(deltaRunnerLog);
    const campaignObjects = extractJsonObjects(campaignRunnerLog);
    const probeFilter = findFilterSummary(probeObjects);
    const expandFilter = findFilterSummary(expandObjects);
    const seedBuildSummary = findSeedBuildSummary(campaignObjects);
    const recentSeedBlockedReport = readJson(recentSeedBlockedPath);
    const topBlockedSummary = buildTopBlockedSummary(recentSeedBlockedReport);
    const blockedReasons = {
      recordedAt: new Date().toISOString(),
      campaignTag,
      seed: buildSeedBlockedReasons(seedBuildSummary),
      probe: buildBlockedReasons("probe", probeFilter),
      expand: buildBlockedReasons("expand", expandFilter)
    };

    const summary = {
      recordedAt: new Date().toISOString(),
      campaignTag,
      runDate,
      outcome,
      runExpand,
      seedBuild: seedBuildSummary,
      seed: {
        seedFile,
        count: readJsonArrayLength(seedFile)
      },
      reports: {
        autoExcludePath,
        blockedReasonsPath,
        freshInputReportPath,
        recentSeedExcludePath,
        recentSeedBlockedPath,
        topBlockedSummaryPath
      },
      probe: {
        outputDir: probeDir,
        auth: findAuthSummary(probeObjects),
        filter: probeFilter,
        deltaCount: readJsonArrayLength(`${probeDir}/delta-import-handles.json`)
      },
      expand: {
        outputDir: expandDir,
        auth: findAuthSummary(expandObjects),
        filter: expandFilter,
        deltaCount: readJsonArrayLength(`${expandDir}/delta-import-handles.json`)
      },
      deltaPipeline: {
        runnerLog: deltaRunnerLog,
        import: findImportSummary(deltaObjects),
        coverage: findCoverageSummary(deltaObjects)
      }
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
    fs.writeFileSync(blockedReasonsPath, JSON.stringify(blockedReasons, null, 2) + "\n");
    fs.writeFileSync(topBlockedSummaryPath, JSON.stringify(topBlockedSummary, null, 2) + "\n");
  ' "$CAMPAIGN_TAG" "$RUN_DATE" "$SUMMARY_PATH" "$SEED_FILE" \
    "$REPO_DIR/output/bonjour-raw/$RUN_DATE/$PROBE_BATCH_TAG" \
    "$REPO_DIR/output/bonjour-raw/$RUN_DATE/${PROBE_BATCH_TAG}-runner.log" \
    "$REPO_DIR/output/bonjour-raw/$RUN_DATE/$EXPAND_BATCH_TAG" \
    "$REPO_DIR/output/bonjour-raw/$RUN_DATE/${EXPAND_BATCH_TAG}-runner.log" \
    "$REPO_DIR/output/bonjour-raw/$RUN_DATE/${EXPAND_BATCH_TAG}-delta-runner.log" \
    "${1:-unknown}" \
    "$RUN_EXPAND" \
    "$AUTO_EXCLUDE_PATH" \
    "$BLOCKED_REASONS_PATH" \
    "$LOG_PATH" \
    "$FRESH_INPUT_REPORT_PATH" \
    "$RECENT_SEED_EXCLUDE_PATH" \
    "$RECENT_SEED_BLOCKED_PATH" \
    "$TOP_BLOCKED_SUMMARY_PATH"
}

if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

csv_to_array() {
  local raw="$1"
  local item

  if [[ -z "$raw" ]]; then
    return 0
  fi

  IFS=',' read -r -a items <<<"$raw"
  for item in "${items[@]}"; do
    item="${item// /}"
    [[ -n "$item" ]] && printf '%s\n' "$item"
  done
}

discover_default_fresh_inputs() {
  "$NODE_BIN" -e '
    const fs = require("fs");
    const path = require("path");

    const root = process.argv[1];
    const campaignDir = process.argv[2];
    const windowSeconds = Number(process.argv[3] || 600);
    const maxFiles = Number(process.argv[4] || 0);

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(nextPath));
          continue;
        }

        files.push(nextPath);
      }
      return files;
    };

    if (!fs.existsSync(root)) {
      process.exit(0);
    }

    const candidates = walk(root)
      .filter((filePath) => filePath.endsWith("-seeds.json"))
      .filter((filePath) => path.basename(filePath) !== "fresh-auth-seeds.json")
      .filter((filePath) => !filePath.startsWith(campaignDir + path.sep))
      .filter((filePath) => path.dirname(filePath) !== root)
      .map((filePath) => ({
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      }))
      .sort((left, right) => left.mtimeMs - right.mtimeMs || left.filePath.localeCompare(right.filePath));

    if (candidates.length === 0) {
      process.exit(0);
    }

    const newestMtime = candidates[candidates.length - 1].mtimeMs;
    const cutoff = newestMtime - windowSeconds * 1000;
    const selectedCandidates = candidates.filter((candidate) => candidate.mtimeMs >= cutoff);
    const narrowedCandidates =
      Number.isFinite(maxFiles) && maxFiles > 0
        ? selectedCandidates.slice(-maxFiles)
        : selectedCandidates;
    const selected = narrowedCandidates.map((candidate) => candidate.filePath);

    process.stdout.write(selected.join("\n"));
    if (selected.length > 0) {
      process.stdout.write("\n");
    }
  ' "$REPO_DIR/output/bonjour-raw/$RUN_DATE" "$CAMPAIGN_DIR" "$FRESH_INPUT_WINDOW_SECONDS" "$FRESH_INPUT_MAX_FILES"
}

discover_default_auto_excludes() {
  local summary_path
  while IFS= read -r summary_path; do
    [[ -z "$summary_path" ]] && continue

    local prior_campaign_dir
    prior_campaign_dir="$(dirname "$summary_path")"
    [[ "$prior_campaign_dir" == "$CAMPAIGN_DIR" ]] && continue

    local prior_run_dir
    prior_run_dir="$(dirname "$prior_campaign_dir")"
    local prior_campaign_tag
    prior_campaign_tag="$(basename "$prior_campaign_dir")"

    local candidates=(
      "$prior_run_dir/${prior_campaign_tag}-probe/import-handles.json"
      "$prior_run_dir/${prior_campaign_tag}-probe/delta-import-handles.json"
      "$prior_run_dir/${prior_campaign_tag}-expand/import-handles.json"
      "$prior_run_dir/${prior_campaign_tag}-expand/delta-import-handles.json"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
      [[ -f "$candidate" ]] && printf '%s\n' "$candidate"
    done
  done < <(
    find "$REPO_DIR/output/bonjour-raw" \
      -type f \
      -name 'summary.json' \
      ! -path "$CAMPAIGN_DIR/*" \
      | sort
  )
}

discover_recent_fresh_auth_seed_excludes() {
  "$NODE_BIN" -e '
    const fs = require("fs");
    const path = require("path");

    const repoRoot = process.argv[1];
    const campaignDir = process.argv[2];
    const maxCampaigns = Number(process.argv[3] || 3);

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(nextPath));
          continue;
        }

        files.push(nextPath);
      }
      return files;
    };

    const outputRoot = path.join(repoRoot, "output", "bonjour-raw");
    if (!fs.existsSync(outputRoot)) {
      process.exit(0);
    }

    const summaries = walk(outputRoot)
      .filter((filePath) => path.basename(filePath) === "summary.json")
      .filter((filePath) => !filePath.startsWith(campaignDir + path.sep))
      .map((summaryPath) => {
        const campaignPath = path.dirname(summaryPath);
        const seedPath = path.join(campaignPath, "fresh-auth-seeds.json");
        if (!fs.existsSync(seedPath)) {
          return null;
        }

        const summary = (() => {
          try {
            return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
          } catch {
            return null;
          }
        })();

        return {
          summaryPath,
          seedPath,
          recordedAt: summary?.recordedAt ? Date.parse(summary.recordedAt) : 0,
          mtimeMs: fs.statSync(summaryPath).mtimeMs
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.recordedAt - left.recordedAt || right.mtimeMs - left.mtimeMs || left.seedPath.localeCompare(right.seedPath))
      .slice(0, Math.max(0, maxCampaigns))
      .map((entry) => entry.seedPath);

    process.stdout.write(summaries.join("\n"));
    if (summaries.length > 0) {
      process.stdout.write("\n");
    }
  ' "$REPO_DIR" "$CAMPAIGN_DIR" "$RECENT_FRESH_AUTH_SEED_COUNT"
}

write_path_array_json() {
  local output_path="$1"
  shift

  "$NODE_BIN" -e '
    const fs = require("fs");
    const path = require("path");
    const outputPath = process.argv[1];
    const values = [...new Set(process.argv.slice(2).filter(Boolean))];
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(values, null, 2) + "\n");
  ' "$output_path" "$@"
}

write_recent_seed_blocked_report() {
  "$NODE_BIN" -e '
    const fs = require("fs");
    const path = require("path");

    const outputPath = process.argv[1];
    const freshInputs = process.argv[2] ? JSON.parse(process.argv[2]) : [];
    const autoExcludeInputs = process.argv[3] ? JSON.parse(process.argv[3]) : [];
    const recentSeedExcludes = process.argv[4] ? JSON.parse(process.argv[4]) : [];
    const manualExcludeInputs = process.argv[5] ? JSON.parse(process.argv[5]) : [];

    const readRecords = (filePath) => {
      if (!filePath || !fs.existsSync(filePath)) {
        return [];
      }

      let value;
      try {
        value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return [];
      }

      if (!Array.isArray(value)) {
        return [];
      }

      return value.flatMap((item) => {
        if (typeof item === "string") {
          const handle = item.trim();
          return handle ? [{ handle, name: null, sourceFile: filePath }] : [];
        }

        if (!item || typeof item !== "object") {
          return [];
        }

        const handleCandidate = item.handle ?? item.profile_link ?? item.profileLink ?? item.sourceHandle;
        if (typeof handleCandidate !== "string" || !handleCandidate.trim()) {
          return [];
        }

        return [{
          handle: handleCandidate.trim(),
          name: typeof item.name === "string" ? item.name : null,
          sourceFile: filePath
        }];
      });
    };

    const handleMap = new Map();
    for (const filePath of freshInputs) {
      for (const record of readRecords(filePath)) {
        const existing = handleMap.get(record.handle) ?? {
          handle: record.handle,
          name: record.name,
          freshSources: []
        };
        if (!existing.name && record.name) {
          existing.name = record.name;
        }
        if (!existing.freshSources.includes(record.sourceFile)) {
          existing.freshSources.push(record.sourceFile);
        }
        handleMap.set(record.handle, existing);
      }
    }

    const describeExcludeSource = (filePath, sourceType) => {
      const parentDir = path.basename(path.dirname(filePath));
      if (sourceType === "recent_seed_exclude") {
        return {
          sourceType,
          campaignTag: parentDir,
          campaignStage: "seed",
          excludeFile: filePath
        };
      }

      if (parentDir.endsWith("-probe")) {
        return {
          sourceType,
          campaignTag: parentDir.slice(0, -"-probe".length),
          campaignStage: "probe",
          excludeFile: filePath
        };
      }

      if (parentDir.endsWith("-expand")) {
        return {
          sourceType,
          campaignTag: parentDir.slice(0, -"-expand".length),
          campaignStage: "expand",
          excludeFile: filePath
        };
      }

      return {
        sourceType,
        campaignTag: parentDir,
        campaignStage: null,
        excludeFile: filePath
      };
    };

    const blockedMap = new Map();
    const registerMatches = (filePaths, sourceType) => {
      for (const filePath of filePaths) {
        const source = describeExcludeSource(filePath, sourceType);
        for (const record of readRecords(filePath)) {
          const current = handleMap.get(record.handle);
          if (!current) {
            continue;
          }

          const blocked = blockedMap.get(record.handle) ?? {
            handle: record.handle,
            name: current.name ?? record.name ?? null,
            freshSources: current.freshSources,
            matchedExcludeSources: []
          };

          const signature = `${source.sourceType}:${source.excludeFile}`;
          if (!blocked.matchedExcludeSources.some((item) => `${item.sourceType}:${item.excludeFile}` === signature)) {
            blocked.matchedExcludeSources.push(source);
          }
          blockedMap.set(record.handle, blocked);
        }
      }
    };

    registerMatches(autoExcludeInputs, "auto_exclude");
    registerMatches(recentSeedExcludes, "recent_seed_exclude");
    registerMatches(manualExcludeInputs, "manual_exclude");

    const blockedHandles = [...blockedMap.values()]
      .map((item) => {
        const matchedExcludeSources = item.matchedExcludeSources.sort((left, right) =>
          left.excludeFile.localeCompare(right.excludeFile)
        );
        const sourceTypes = [...new Set(matchedExcludeSources.map((entry) => entry.sourceType))];
        return {
          ...item,
          matchedExcludeSourceCount: matchedExcludeSources.length,
          matchedExcludeSourceTypes: sourceTypes,
          matchedExcludeSources
        };
      })
      .sort((left, right) =>
        left.handle.localeCompare(right.handle)
      );

    const sourceTypeBreakdown = blockedHandles.reduce((acc, item) => {
      for (const sourceType of item.matchedExcludeSourceTypes) {
        acc[sourceType] = (acc[sourceType] ?? 0) + 1;
      }
      return acc;
    }, {});

    const report = {
      recordedAt: new Date().toISOString(),
      freshInputFileCount: freshInputs.length,
      autoExcludeFileCount: autoExcludeInputs.length,
      recentSeedExcludeFileCount: recentSeedExcludes.length,
      manualExcludeFileCount: manualExcludeInputs.length,
      blockedHandleCount: blockedHandles.length,
      blockedHandleCountsBySourceType: sourceTypeBreakdown,
      blockedHandles
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  ' "$RECENT_SEED_BLOCKED_PATH" \
    "$(printf '%s\n' "${fresh_inputs[@]}" | "$NODE_BIN" -e 'const fs=require("fs"); const lines=fs.readFileSync(0,"utf8").split(/\n/).map((line)=>line.trim()).filter(Boolean); process.stdout.write(JSON.stringify(lines));')" \
    "$(printf '%s\n' "${auto_exclude_inputs[@]-}" | "$NODE_BIN" -e 'const fs=require("fs"); const lines=fs.readFileSync(0,"utf8").split(/\n/).map((line)=>line.trim()).filter(Boolean); process.stdout.write(JSON.stringify(lines));')" \
    "$(printf '%s\n' "${recent_seed_excludes[@]-}" | "$NODE_BIN" -e 'const fs=require("fs"); const lines=fs.readFileSync(0,"utf8").split(/\n/).map((line)=>line.trim()).filter(Boolean); process.stdout.write(JSON.stringify(lines));')" \
    "$(printf '%s\n' "${exclude_inputs[@]-}" | "$NODE_BIN" -e 'const fs=require("fs"); const lines=fs.readFileSync(0,"utf8").split(/\n/).map((line)=>line.trim()).filter(Boolean); process.stdout.write(JSON.stringify(lines));')"
}

read_paths_into_array() {
  local mode="$1"
  local values="$2"
  local line

  if [[ -n "$values" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" && -f "$line" ]] && printf '%s\n' "$line"
    done < <(csv_to_array "$values")
    return 0
  fi

  if [[ "$mode" == "fresh" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" && -f "$line" ]] && printf '%s\n' "$line"
    done < <(discover_default_fresh_inputs)
  fi
}

cd "$REPO_DIR"

fresh_inputs=()
while IFS= read -r line; do
  [[ -n "$line" ]] && fresh_inputs+=("$line")
done < <(read_paths_into_array fresh "$FRESH_INPUTS")
write_path_array_json "$FRESH_INPUT_REPORT_PATH" "${fresh_inputs[@]}"

history_inputs=()
while IFS= read -r line; do
  [[ -n "$line" ]] && history_inputs+=("$line")
done < <(read_paths_into_array history "$HISTORY_INPUTS")

exclude_inputs=()
while IFS= read -r line; do
  [[ -n "$line" ]] && exclude_inputs+=("$line")
done < <(read_paths_into_array exclude "$EXCLUDE_INPUTS")

auto_exclude_inputs=()
if [[ "$AUTO_EXCLUDE" -eq 1 ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && auto_exclude_inputs+=("$line")
  done < <(discover_default_auto_excludes)
fi

recent_seed_excludes=()
while IFS= read -r line; do
  [[ -n "$line" ]] && recent_seed_excludes+=("$line")
done < <(discover_recent_fresh_auth_seed_excludes)
write_path_array_json "$RECENT_SEED_EXCLUDE_PATH" "${recent_seed_excludes[@]}"
write_recent_seed_blocked_report

if [[ "${#fresh_inputs[@]}" -eq 0 ]]; then
  log "no fresh seed inputs found for run_date=$RUN_DATE"
  exit 1
fi

log "fresh_input_window_seconds=$FRESH_INPUT_WINDOW_SECONDS fresh_input_max_files=$FRESH_INPUT_MAX_FILES newest_cluster_file_count=${#fresh_inputs[@]}"

manual_exclude_count="${#exclude_inputs[@]}"
if [[ "${#auto_exclude_inputs[@]}" -gt 0 ]]; then
  exclude_inputs+=("${auto_exclude_inputs[@]}")
fi
if [[ "${#recent_seed_excludes[@]}" -gt 0 ]]; then
  exclude_inputs+=("${recent_seed_excludes[@]}")
fi

deduped_exclude_inputs=()
if [[ "${#exclude_inputs[@]}" -gt 0 ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && deduped_exclude_inputs+=("$line")
  done < <(printf '%s\n' "${exclude_inputs[@]}" | awk '!seen[$0]++')
fi
exclude_inputs=("${deduped_exclude_inputs[@]}")

write_path_array_json "$AUTO_EXCLUDE_PATH" "${auto_exclude_inputs[@]}"

builder_args=(
  --output "$SEED_FILE"
  --limit "$SEED_LIMIT"
  --skip "$SEED_SKIP"
  --min-occurrences "$SEED_MIN_OCCURRENCES"
  --require-profile-name
)

if [[ "${#fresh_inputs[@]}" -gt 0 ]]; then
  for file in "${fresh_inputs[@]}"; do
    builder_args+=(--fresh-input "$file")
  done
fi

if [[ "${#history_inputs[@]}" -gt 0 ]]; then
  for file in "${history_inputs[@]}"; do
    builder_args+=(--history-input "$file")
  done
fi

if [[ "${#exclude_inputs[@]}" -gt 0 ]]; then
  for file in "${exclude_inputs[@]}"; do
    builder_args+=(--exclude "$file")
  done
fi

while IFS= read -r keyword; do
  [[ -n "$keyword" ]] && builder_args+=(--keyword "$keyword")
done < <(csv_to_array "$KEYWORDS")

log "building fresh auth seeds output=$SEED_FILE fresh_inputs=${#fresh_inputs[@]} history_inputs=${#history_inputs[@]} exclude_inputs=${#exclude_inputs[@]} auto_excludes=${#auto_exclude_inputs[@]} recent_seed_excludes=${#recent_seed_excludes[@]} manual_excludes=$manual_exclude_count"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts build-bonjour-fresh-auth-seeds "${builder_args[@]}" >> "$LOG_PATH" 2>&1

SEED_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$SEED_FILE")"
log "fresh_seed_count=$SEED_COUNT seed_file=$SEED_FILE"

if [[ "$SEED_COUNT" -eq 0 ]]; then
  log "fresh auth seed file empty; stopping"
  write_summary "empty_seed_file"
  exit 0
fi

log "running depth0 probe batch_tag=$PROBE_BATCH_TAG"
RUN_DATE="$RUN_DATE" \
BATCH_TAG="$PROBE_BATCH_TAG" \
SEED_FILE="$SEED_FILE" \
AUTH_MAX_NODES="$PROBE_MAX_NODES" \
AUTH_CONCURRENCY="$PROBE_CONCURRENCY" \
RUN_DELTA_PIPELINE=0 \
/bin/bash "$REPO_DIR/scripts/run_bonjour_auth_probe_from_seed_file.sh" >> "$LOG_PATH" 2>&1

PROBE_DELTA_FILE="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$PROBE_BATCH_TAG/delta-import-handles.json"
PROBE_DELTA_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); const p=process.argv[1]; if (!fs.existsSync(p)) { console.log(0); process.exit(0); } console.log(JSON.parse(fs.readFileSync(p, "utf8")).length);' "$PROBE_DELTA_FILE")"
log "probe_delta_count=$PROBE_DELTA_COUNT delta_file=$PROBE_DELTA_FILE"

if [[ "$PROBE_DELTA_COUNT" -eq 0 ]]; then
  log "probe produced no new delta handles; stopping before expand"
  write_summary "probe_no_delta"
  exit 0
fi

if [[ "$RUN_EXPAND" -ne 1 ]]; then
  log "RUN_EXPAND=$RUN_EXPAND; skipping expand stage"
  write_summary "probe_delta_only"
  exit 0
fi

log "running expand frontier batch_tag=$EXPAND_BATCH_TAG depth=$EXPAND_DEPTH"
RUN_DATE="$RUN_DATE" \
BATCH_TAG="$EXPAND_BATCH_TAG" \
SEED_FILE="$PROBE_DELTA_FILE" \
AUTH_DEPTH="$EXPAND_DEPTH" \
AUTH_MAX_NODES="$EXPAND_MAX_NODES" \
AUTH_CONCURRENCY="$EXPAND_CONCURRENCY" \
/bin/bash "$REPO_DIR/scripts/run_bonjour_auth_frontier_from_seed_file.sh" >> "$LOG_PATH" 2>&1

log "fresh auth probe flow finished"
write_summary "expand_finished"
