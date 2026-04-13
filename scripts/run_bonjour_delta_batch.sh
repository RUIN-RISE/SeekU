#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
BATCH_TAG="${BATCH_TAG:-bonjour-batch-c-delta}"
DELTA_IMPORT_HANDLES_PATH="${DELTA_IMPORT_HANDLES_PATH:-$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-auth-frontier/delta-import-handles.json}"
RAW_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${BATCH_TAG}-raw"
LOG_PATH="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${BATCH_TAG}-runner.log"
RAW_TIMELINE_CONCURRENCY="${RAW_TIMELINE_CONCURRENCY:-4}"
RAW_PROFILE_CONCURRENCY="${RAW_PROFILE_CONCURRENCY:-4}"
RAW_COMMENT_CONCURRENCY="${RAW_COMMENT_CONCURRENCY:-4}"
RAW_MAX_PROFILE_PAGES="${RAW_MAX_PROFILE_PAGES:-2}"
IMPORT_CONCURRENCY="${IMPORT_CONCURRENCY:-8}"
PIPELINE_BATCH_SIZE="${PIPELINE_BATCH_SIZE:-100}"
SCAN_COMMENTERS="${SCAN_COMMENTERS:-1}"

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_PATH"
}

load_default_env() {
  local env_file="$REPO_DIR/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

cd "$REPO_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  load_default_env
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

if [[ ! -f "$DELTA_IMPORT_HANDLES_PATH" ]]; then
  log "missing delta import handles file: $DELTA_IMPORT_HANDLES_PATH"
  exit 1
fi

DELTA_IMPORT_HANDLE_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$DELTA_IMPORT_HANDLES_PATH")"

log "delta batch started"
log "batch_tag=$BATCH_TAG delta_import_handles=$DELTA_IMPORT_HANDLES_PATH raw_dir=$RAW_DIR"
log "delta_import_handle_count=$DELTA_IMPORT_HANDLE_COUNT"

if [[ "$DELTA_IMPORT_HANDLE_COUNT" -eq 0 ]]; then
  log "delta import handles empty; skipping raw/import/dedupe"
  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts coverage --json >> "$LOG_PATH" 2>&1
  log "delta batch finished"
  exit 0
fi

if [[ -f "$RAW_DIR/manifest.json" ]]; then
  log "raw dump already exists, reusing $RAW_DIR"
else
  log "starting delta-only raw dump with imported profile timelines"
  RAW_ARGS=(
    --import-handles "$DELTA_IMPORT_HANDLES_PATH"
    --skip-category-timeline
    --scan-imported-profile-timelines
    --max-profile-pages-per-handle "$RAW_MAX_PROFILE_PAGES"
    --timeline-concurrency "$RAW_TIMELINE_CONCURRENCY"
    --profile-concurrency "$RAW_PROFILE_CONCURRENCY"
    --comment-concurrency "$RAW_COMMENT_CONCURRENCY"
    --output "$RAW_DIR"
  )

  if [[ "$SCAN_COMMENTERS" -eq 1 ]]; then
    RAW_ARGS+=(--scan-commenters)
  fi

  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-raw "${RAW_ARGS[@]}" >> "$LOG_PATH" 2>&1
fi

log "raw dump stage finished"
log "starting import + local pipeline"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts import-bonjour-dump \
  --dump-dir "$RAW_DIR" \
  --concurrency "$IMPORT_CONCURRENCY" \
  --run-local-pipeline \
  --pipeline-batch-size "$PIPELINE_BATCH_SIZE" >> "$LOG_PATH" 2>&1

log "import stage finished"
log "starting conservative same-source dedupe"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dedupe-bonjour >> "$LOG_PATH" 2>&1

log "dedupe finished"
log "collecting coverage"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts coverage --json >> "$LOG_PATH" 2>&1

log "delta batch finished"
