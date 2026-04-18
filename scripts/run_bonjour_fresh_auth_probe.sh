#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
CAMPAIGN_TAG="${CAMPAIGN_TAG:-bonjour-fresh-auth-probe}"
CAMPAIGN_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$CAMPAIGN_TAG"
LOG_PATH="$CAMPAIGN_DIR/runner.log"
SEED_FILE="${SEED_FILE:-$CAMPAIGN_DIR/fresh-auth-seeds.json}"

FRESH_INPUTS="${FRESH_INPUTS:-}"
HISTORY_INPUTS="${HISTORY_INPUTS:-}"
EXCLUDE_INPUTS="${EXCLUDE_INPUTS:-}"
KEYWORDS="${KEYWORDS:-浙大,ZJU,杭州,AI,创业}"
SEED_LIMIT="${SEED_LIMIT:-50}"
SEED_SKIP="${SEED_SKIP:-0}"
SEED_MIN_OCCURRENCES="${SEED_MIN_OCCURRENCES:-1}"

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
  find "$REPO_DIR/output/bonjour-raw/$RUN_DATE" \
    -type f \
    -name '*-seeds.json' \
    ! -path "$CAMPAIGN_DIR/*" \
    | sort
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

history_inputs=()
while IFS= read -r line; do
  [[ -n "$line" ]] && history_inputs+=("$line")
done < <(read_paths_into_array history "$HISTORY_INPUTS")

exclude_inputs=()
while IFS= read -r line; do
  [[ -n "$line" ]] && exclude_inputs+=("$line")
done < <(read_paths_into_array exclude "$EXCLUDE_INPUTS")

if [[ "${#fresh_inputs[@]}" -eq 0 ]]; then
  log "no fresh seed inputs found for run_date=$RUN_DATE"
  exit 1
fi

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

log "building fresh auth seeds output=$SEED_FILE fresh_inputs=${#fresh_inputs[@]} history_inputs=${#history_inputs[@]} exclude_inputs=${#exclude_inputs[@]}"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts build-bonjour-fresh-auth-seeds "${builder_args[@]}" >> "$LOG_PATH" 2>&1

SEED_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$SEED_FILE")"
log "fresh_seed_count=$SEED_COUNT seed_file=$SEED_FILE"

if [[ "$SEED_COUNT" -eq 0 ]]; then
  log "fresh auth seed file empty; stopping"
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
  exit 0
fi

if [[ "$RUN_EXPAND" -ne 1 ]]; then
  log "RUN_EXPAND=$RUN_EXPAND; skipping expand stage"
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
