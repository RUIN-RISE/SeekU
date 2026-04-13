#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
CAMPAIGN_TAG="${CAMPAIGN_TAG:-bonjour-long-campaign}"
CAMPAIGN_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$CAMPAIGN_TAG"
CAMPAIGN_LOG="$CAMPAIGN_DIR/campaign.log"
CAMPAIGN_SUMMARY="$CAMPAIGN_DIR/campaign-summary.jsonl"
MAX_ZERO_DELTA_STAGES="${MAX_ZERO_DELTA_STAGES:-2}"
CONTINUE_FROM_CAMPAIGN_TAGS="${CONTINUE_FROM_CAMPAIGN_TAGS:-}"

BASE_EXCLUDE_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-auth-handles-depth5-batch3-top1000-2026-04-08T10-32Z/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-auth-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-auth-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-d-auth-probe-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-d-auth-probe/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-f-auth-probe-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-f-auth-probe/import-handles.json"
)

RAW_HANDLE_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-raw-auth-depth2-plus-depth3-full-plus-depth4-batch2-expanded-profiles-2026-04-08T09-22Z/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-raw/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-raw/handles.json"
)

STAGE_SPECS=(
  "h1_comment_occ3|10|0|3|--require-profile-name --require-source-kind post_comment --exclude-source-kind external_import|unconsumed comment-only occurrence>=3"
  "h2_comment_occ2|10|0|2|--require-profile-name --require-source-kind post_comment --exclude-source-kind external_import|unconsumed comment-only occurrence>=2"
  "h3_import_comment_occ2|10|0|2|--require-profile-name --require-source-kind post_comment --require-source-kind external_import|unconsumed comment+import occurrence>=2"
  "h4_tail_visible|20|0|1|--require-category-visible --require-profile-name|category-visible tail"
)

mkdir -p "$CAMPAIGN_DIR"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$CAMPAIGN_LOG"
}

append_campaign_excludes() {
  local campaign_tag="$1"
  local prior_campaign_dir="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$campaign_tag"

  if [[ ! -d "$prior_campaign_dir" ]]; then
    return
  fi

  local file
  if compgen -G "$prior_campaign_dir/*-seeds.json" >/dev/null; then
    for file in "$prior_campaign_dir"/*-seeds.json; do
      [[ -f "$file" ]] && BASE_EXCLUDE_FILES+=("$file")
    done
  fi

  if compgen -G "$REPO_DIR/output/bonjour-raw/$RUN_DATE/${campaign_tag}-*/import-handles.json" >/dev/null; then
    for file in $REPO_DIR/output/bonjour-raw/$RUN_DATE/${campaign_tag}-*/import-handles.json; do
      [[ -f "$file" ]] && BASE_EXCLUDE_FILES+=("$file")
    done
  fi

  if compgen -G "$REPO_DIR/output/bonjour-raw/$RUN_DATE/${campaign_tag}-*/delta-import-handles.json" >/dev/null; then
    for file in $REPO_DIR/output/bonjour-raw/$RUN_DATE/${campaign_tag}-*/delta-import-handles.json; do
      [[ -f "$file" ]] && BASE_EXCLUDE_FILES+=("$file")
    done
  fi

  return 0
}

if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

cd "$REPO_DIR"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

if [[ -n "$CONTINUE_FROM_CAMPAIGN_TAGS" ]]; then
  IFS=',' read -r -a continue_tags <<<"$CONTINUE_FROM_CAMPAIGN_TAGS"
  for continue_tag in "${continue_tags[@]}"; do
    continue_tag="${continue_tag// /}"
    [[ -n "$continue_tag" ]] && append_campaign_excludes "$continue_tag"
  done
fi

json_array_length() {
  "$NODE_BIN" -e 'const fs=require("fs"); const path=process.argv[1]; if (!fs.existsSync(path)) { console.log(0); process.exit(0); } const value=JSON.parse(fs.readFileSync(path, "utf8")); console.log(Array.isArray(value) ? value.length : 0);' "$1"
}

append_summary_jsonl() {
  local stage="$1"
  local description="$2"
  local seed_file="$3"
  local runner_log="$4"
  local delta_file="$5"
  "$NODE_BIN" -e '
    const fs = require("fs");
    const [stage, description, seedFile, runnerLog, deltaFile, summaryPath] = process.argv.slice(1);
    const readJsonArrayLength = (path) => {
      if (!fs.existsSync(path)) return 0;
      const raw = fs.readFileSync(path, "utf8").trim();
      if (!raw) return 0;
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        return 0;
      }
      return Array.isArray(value) ? value.length : 0;
    };
    const text = fs.existsSync(runnerLog) ? fs.readFileSync(runnerLog, "utf8") : "";
    const jsonChunks = [...text.matchAll(/\{\n[\s\S]*?\n\}/g)].map((match) => {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const authSummary = jsonChunks.find((item) => typeof item.fetchedNodes === "number" && typeof item.discoveredHandles === "number") ?? null;
    const importSummary = jsonChunks.find((item) => typeof item.processedCount === "number" && item.pipeline) ?? null;
    const coverageSummary = [...jsonChunks].reverse().find((item) => typeof item.totalPersons === "number") ?? null;
    const record = {
      recordedAt: new Date().toISOString(),
      stage,
      description,
      seedCount: readJsonArrayLength(seedFile),
      deltaCount: readJsonArrayLength(deltaFile),
      auth: authSummary,
      import: importSummary,
      coverage: coverageSummary
    };
    fs.appendFileSync(summaryPath, JSON.stringify(record) + "\n");
  ' "$stage" "$description" "$seed_file" "$runner_log" "$delta_file" "$CAMPAIGN_SUMMARY"
}

build_seed_stage() {
  local stage="$1"
  local limit="$2"
  local skip="$3"
  local min_occurrences="$4"
  local extra_flags="$5"
  local seed_file="$CAMPAIGN_DIR/${stage}-seeds.json"

  local args=(
    --output "$seed_file"
    --limit "$limit"
    --skip "$skip"
    --min-occurrences "$min_occurrences"
  )

  local file
  for file in "${RAW_HANDLE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      args+=(--input "$file")
    fi
  done

  for file in "${BASE_EXCLUDE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      args+=(--exclude "$file")
    fi
  done

  if compgen -G "$CAMPAIGN_DIR/*-seeds.json" >/dev/null; then
    for file in "$CAMPAIGN_DIR"/*-seeds.json; do
      [[ -f "$file" ]] && args+=(--exclude "$file")
    done
  fi

  if compgen -G "$CAMPAIGN_DIR/*/import-handles.json" >/dev/null; then
    for file in "$CAMPAIGN_DIR"/*/import-handles.json; do
      [[ -f "$file" ]] && args+=(--exclude "$file")
    done
  fi

  if [[ -n "$extra_flags" ]]; then
    # shellcheck disable=SC2206
    local extra_array=($extra_flags)
    args+=("${extra_array[@]}")
  fi

  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts build-bonjour-auth-probe-seeds \
    "${args[@]}" >> "$CAMPAIGN_LOG" 2>&1

  printf '%s\n' "$seed_file"
}

run_stage() {
  local stage="$1"
  local limit="$2"
  local skip="$3"
  local min_occurrences="$4"
  local extra_flags="$5"
  local description="$6"

  log "stage=$stage description=$description building seeds"
  local seed_file
  seed_file="$(build_seed_stage "$stage" "$limit" "$skip" "$min_occurrences" "$extra_flags")"
  local seed_count
  seed_count="$(json_array_length "$seed_file")"
  log "stage=$stage seed_file=$seed_file seed_count=$seed_count"

  if [[ "$seed_count" -eq 0 ]]; then
    append_summary_jsonl "$stage" "$description" "$seed_file" "/dev/null" "/dev/null"
    return 2
  fi

  local batch_tag="${CAMPAIGN_TAG}-${stage}"
  local runner_log="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${batch_tag}-runner.log"
  local delta_file="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${batch_tag}/delta-import-handles.json"

  RUN_DATE="$RUN_DATE" \
  BATCH_TAG="$batch_tag" \
  SEED_FILE="$seed_file" \
  /bin/bash "$REPO_DIR/scripts/run_bonjour_auth_probe_from_seed_file.sh" >> "$CAMPAIGN_LOG" 2>&1

  local delta_count
  delta_count="$(json_array_length "$delta_file")"
  log "stage=$stage completed delta_count=$delta_count runner_log=$runner_log"
  append_summary_jsonl "$stage" "$description" "$seed_file" "$runner_log" "$delta_file"

  if [[ "$delta_count" -gt 0 ]]; then
    return 0
  fi

  return 1
}

log "campaign started campaign_tag=$CAMPAIGN_TAG run_date=$RUN_DATE"
echo -n "" > "$CAMPAIGN_SUMMARY"

zero_delta_stages=0
for spec in "${STAGE_SPECS[@]}"; do
  IFS='|' read -r stage limit skip min_occurrences extra_flags description <<<"$spec"

  if run_stage "$stage" "$limit" "$skip" "$min_occurrences" "$extra_flags" "$description"; then
    zero_delta_stages=0
  else
    status=$?
    if [[ "$status" -eq 2 ]]; then
      log "stage=$stage skipped due to empty seed file"
    else
      zero_delta_stages=$((zero_delta_stages + 1))
      log "stage=$stage produced zero delta; consecutive_zero_delta_stages=$zero_delta_stages"
    fi
  fi

  if [[ "$zero_delta_stages" -ge "$MAX_ZERO_DELTA_STAGES" ]]; then
    log "stopping campaign after $zero_delta_stages consecutive zero-delta stages"
    break
  fi
done

log "campaign finished summary_path=$CAMPAIGN_SUMMARY"
