#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="$(date -u +%F)"
AUTH_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-a-auth-frontier"
RAW_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-a-raw"
LOG_PATH="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-a-runner.log"
SEED_FILE="$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-auth-handles-depth5-batch3-top1000-2026-04-08T10-32Z/import-handles.json"
AUTH_MAX_NODES="${AUTH_MAX_NODES:-5000}"
AUTH_DEPTH="${AUTH_DEPTH:-0}"
AUTH_CONCURRENCY="${AUTH_CONCURRENCY:-8}"
AUTH_CHECKPOINT_EVERY="${AUTH_CHECKPOINT_EVERY:-100}"
RAW_TIMELINE_CONCURRENCY="${RAW_TIMELINE_CONCURRENCY:-8}"
RAW_PROFILE_CONCURRENCY="${RAW_PROFILE_CONCURRENCY:-8}"
RAW_COMMENT_CONCURRENCY="${RAW_COMMENT_CONCURRENCY:-8}"
RAW_MAX_PROFILE_PAGES="${RAW_MAX_PROFILE_PAGES:-2}"
IMPORT_CONCURRENCY="${IMPORT_CONCURRENCY:-12}"
PIPELINE_BATCH_SIZE="${PIPELINE_BATCH_SIZE:-250}"

mkdir -p "$(dirname "$LOG_PATH")" "$AUTH_DIR"

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

extract_token_from_file() {
  local path="$1"
  sed -nE 's/^BONJOUR_TOKEN="?([^"]*)"?$/\1/p' "$path" | head -n 1
}

resolve_bonjour_token() {
  if [[ -n "${BONJOUR_TOKEN:-}" ]]; then
    printf '%s' "$BONJOUR_TOKEN"
    return 0
  fi

  local candidates=()
  if [[ -n "${BONJOUR_TOKEN_SOURCE:-}" ]]; then
    candidates+=("$BONJOUR_TOKEN_SOURCE")
  fi
  candidates+=(
    "$HOME/Desktop/run_bonjour_auth_dump.command"
    "$REPO_DIR/.env.bonjour"
    "$HOME/.config/seeku/bonjour.env"
    "$HOME/.config/seek-zju/bonjour.env"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      local token
      token="$(extract_token_from_file "$candidate")"
      if [[ -n "$token" ]]; then
        printf '%s' "$token"
        return 0
      fi
    fi
  done

  return 1
}

cd "$REPO_DIR"

if [[ ! -f "$SEED_FILE" ]]; then
  log "missing seed file: $SEED_FILE"
  exit 1
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

TOKEN="$(resolve_bonjour_token || true)"
IMPORT_HANDLES_PATH="${BATCH_A_IMPORT_HANDLES:-}"

log "batch A started"
log "auth_dir=$AUTH_DIR raw_dir=$RAW_DIR seed_file=$SEED_FILE"

if [[ -n "$TOKEN" ]]; then
  if [[ -f "$AUTH_DIR/manifest.json" ]]; then
    log "resuming auth frontier crawl max_nodes=$AUTH_MAX_NODES concurrency=$AUTH_CONCURRENCY"
    BONJOUR_TOKEN="$TOKEN" "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-auth-handles \
      --resume "$AUTH_DIR" \
      --max-nodes "$AUTH_MAX_NODES" \
      --checkpoint-every "$AUTH_CHECKPOINT_EVERY" \
      --concurrency "$AUTH_CONCURRENCY" >> "$LOG_PATH" 2>&1
  else
    log "starting auth frontier crawl depth=$AUTH_DEPTH max_nodes=$AUTH_MAX_NODES concurrency=$AUTH_CONCURRENCY"
    BONJOUR_TOKEN="$TOKEN" "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-auth-handles \
      --seed-file "$SEED_FILE" \
      --depth "$AUTH_DEPTH" \
      --max-nodes "$AUTH_MAX_NODES" \
      --checkpoint-every "$AUTH_CHECKPOINT_EVERY" \
      --concurrency "$AUTH_CONCURRENCY" \
      --output "$AUTH_DIR" >> "$LOG_PATH" 2>&1
  fi

  log "auth frontier stage finished"
  IMPORT_HANDLES_PATH="$AUTH_DIR/import-handles.json"
elif [[ -z "$IMPORT_HANDLES_PATH" ]]; then
  IMPORT_HANDLES_PATH="$SEED_FILE"
  log "BONJOUR_TOKEN missing, skipping auth frontier and reusing seed handles for public expansion"
else
  log "BONJOUR_TOKEN missing, skipping auth frontier and using override import handles: $IMPORT_HANDLES_PATH"
fi

if [[ ! -f "$IMPORT_HANDLES_PATH" ]]; then
  log "missing import handles file: $IMPORT_HANDLES_PATH"
  exit 1
fi

if [[ -f "$RAW_DIR/manifest.json" ]]; then
  log "raw dump already exists, reusing $RAW_DIR"
else
  log "starting raw dump with imported timelines, global timeline, and commenters"
  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-raw \
    --import-handles "$IMPORT_HANDLES_PATH" \
    --scan-imported-profile-timelines \
    --scan-global-timeline \
    --scan-commenters \
    --max-profile-pages-per-handle "$RAW_MAX_PROFILE_PAGES" \
    --timeline-concurrency "$RAW_TIMELINE_CONCURRENCY" \
    --profile-concurrency "$RAW_PROFILE_CONCURRENCY" \
    --comment-concurrency "$RAW_COMMENT_CONCURRENCY" \
    --output "$RAW_DIR" >> "$LOG_PATH" 2>&1
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

log "batch A finished"
