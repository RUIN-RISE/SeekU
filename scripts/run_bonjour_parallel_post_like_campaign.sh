#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
CAMPAIGN_TAG="${CAMPAIGN_TAG:-bonjour-parallel-post-like-campaign}"
CAMPAIGN_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$CAMPAIGN_TAG"
CAMPAIGN_LOG="$CAMPAIGN_DIR/campaign.log"
WINDOW_LIMIT="${WINDOW_LIMIT:-20}"
WINDOW_SKIPS="${WINDOW_SKIPS:-0,100,200}"
RESUME_O2="${RESUME_O2:-1}"
O2_MAX_NODES="${O2_MAX_NODES:-10000}"
RESIDUAL_MAX_NODES="${RESIDUAL_MAX_NODES:-2500}"
AUTH_DEPTH="${AUTH_DEPTH:-2}"
AUTH_CONCURRENCY="${AUTH_CONCURRENCY:-4}"
AUTH_CHECKPOINT_EVERY="${AUTH_CHECKPOINT_EVERY:-50}"

BASE_INPUT_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-raw-auth-depth2-plus-depth3-full-plus-depth4-batch2-expanded-profiles-2026-04-08T09-22Z/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-raw/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-raw/handles.json"
)

EXCLUDE_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-auth-handles-depth5-batch3-top1000-2026-04-08T10-32Z/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-auth-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-auth-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-d-auth-probe-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-d-auth-probe/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-f-auth-probe-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-f-auth-probe/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-o2-extra-from-delta-raw-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier/delta-import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-seeds.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-frontier/delta-import-handles.json"
)

mkdir -p "$CAMPAIGN_DIR"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$CAMPAIGN_LOG"
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

json_array_length() {
  "$NODE_BIN" -e 'const fs=require("fs"); const path=process.argv[1]; if (!fs.existsSync(path)) { console.log(0); process.exit(0); } const value=JSON.parse(fs.readFileSync(path, "utf8")); console.log(Array.isArray(value) ? value.length : 0);' "$1"
}

build_residual_seed_window() {
  local stage="$1"
  local skip="$2"
  local seed_file="$CAMPAIGN_DIR/${stage}-seeds.json"
  local args=(
    --output "$seed_file"
    --limit "$WINDOW_LIMIT"
    --skip "$skip"
    --min-occurrences 1
    --no-exclude-pure-post-like
  )
  local file
  for file in "${BASE_INPUT_FILES[@]}"; do
    [[ -f "$file" ]] && args+=(--input "$file")
  done
  for file in "${EXCLUDE_FILES[@]}"; do
    [[ -f "$file" ]] && args+=(--exclude "$file")
  done
  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts build-bonjour-auth-probe-seeds "${args[@]}" >> "$CAMPAIGN_LOG" 2>&1
  printf '%s\n' "$seed_file"
}

launch_frontier() {
  local route_name="$1"
  local batch_tag="$2"
  local seed_file="$3"
  local auth_max_nodes="$4"
  local delta_batch_tag="$5"

  local seed_count
  seed_count="$(json_array_length "$seed_file")"
  log "route=$route_name batch_tag=$batch_tag seed_file=$seed_file seed_count=$seed_count auth_max_nodes=$auth_max_nodes delta_batch_tag=$delta_batch_tag"

  if [[ "$seed_count" -eq 0 ]]; then
    log "route=$route_name skipped_empty_seed_file=$seed_file"
    return 0
  fi

  (
    RUN_DATE="$RUN_DATE" \
    BATCH_TAG="$batch_tag" \
    DELTA_BATCH_TAG="$delta_batch_tag" \
    SEED_FILE="$seed_file" \
    AUTH_DEPTH="$AUTH_DEPTH" \
    AUTH_MAX_NODES="$auth_max_nodes" \
    AUTH_CONCURRENCY="$AUTH_CONCURRENCY" \
    AUTH_CHECKPOINT_EVERY="$AUTH_CHECKPOINT_EVERY" \
    /bin/bash "$REPO_DIR/scripts/run_bonjour_auth_frontier_from_seed_file.sh"
  ) >> "$CAMPAIGN_LOG" 2>&1 &

  local pid=$!
  printf '%s\t%s\t%s\t%s\n' "$pid" "$route_name" "$batch_tag" "$seed_file" >> "$CAMPAIGN_DIR/pids.tsv"
  log "route=$route_name launched pid=$pid batch_tag=$batch_tag"
}

echo -n "" > "$CAMPAIGN_DIR/pids.tsv"
log "parallel post-like campaign started campaign_tag=$CAMPAIGN_TAG run_date=$RUN_DATE window_limit=$WINDOW_LIMIT window_skips=$WINDOW_SKIPS"

if [[ "$RESUME_O2" -eq 1 ]]; then
  launch_frontier \
    "o2_resume" \
    "bonjour-batch-o2-post-like-frontier" \
    "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-o2-extra-from-delta-raw-seeds.json" \
    "$O2_MAX_NODES" \
    "bonjour-batch-o2-post-like-frontier-r$(date +%Y%m%d%H%M%S)-delta"
fi

IFS=',' read -r -a skip_values <<<"$WINDOW_SKIPS"
route_index=1
for skip in "${skip_values[@]}"; do
  skip="${skip// /}"
  [[ -z "$skip" ]] && continue
  stage="residual-window-${route_index}"
  seed_file="$(build_residual_seed_window "$stage" "$skip")"
  launch_frontier \
    "$stage" \
    "${CAMPAIGN_TAG}-${stage}" \
    "$seed_file" \
    "$RESIDUAL_MAX_NODES" \
    "${CAMPAIGN_TAG}-${stage}-delta"
  route_index=$((route_index + 1))
done

log "parallel post-like campaign launch complete pid_table=$CAMPAIGN_DIR/pids.tsv"
