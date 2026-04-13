#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
SOURCE_AUTH_DIR="${SOURCE_AUTH_DIR:-$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-auth-frontier}"
AUTH_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-b-auth-frontier"
RAW_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-b-raw"
LOG_PATH="$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-b-runner.log"
AUTH_MAX_NODES="${AUTH_MAX_NODES:-10000}"
AUTH_CONCURRENCY="${AUTH_CONCURRENCY:-8}"
AUTH_CHECKPOINT_EVERY="${AUTH_CHECKPOINT_EVERY:-100}"
RAW_TIMELINE_CONCURRENCY="${RAW_TIMELINE_CONCURRENCY:-8}"
RAW_PROFILE_CONCURRENCY="${RAW_PROFILE_CONCURRENCY:-8}"
RAW_COMMENT_CONCURRENCY="${RAW_COMMENT_CONCURRENCY:-8}"
RAW_MAX_PROFILE_PAGES="${RAW_MAX_PROFILE_PAGES:-2}"
IMPORT_CONCURRENCY="${IMPORT_CONCURRENCY:-12}"
PIPELINE_BATCH_SIZE="${PIPELINE_BATCH_SIZE:-250}"
FILTER_RESOLVE_SOURCE_PROFILES="${FILTER_RESOLVE_SOURCE_PROFILES:-1}"
FILTER_RESOLVE_CONCURRENCY="${FILTER_RESOLVE_CONCURRENCY:-8}"

mkdir -p "$(dirname "$LOG_PATH")"

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

bootstrap_auth_resume_dir() {
  if [[ -f "$AUTH_DIR/manifest.json" ]]; then
    return 0
  fi

  if [[ ! -f "$SOURCE_AUTH_DIR/manifest.json" ]]; then
    log "missing source auth frontier manifest: $SOURCE_AUTH_DIR/manifest.json"
    exit 1
  fi

  log "bootstrapping batch B auth frontier from $SOURCE_AUTH_DIR"
  cp -R "$SOURCE_AUTH_DIR" "$AUTH_DIR"
}

cd "$REPO_DIR"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

TOKEN="$(resolve_bonjour_token || true)"
if [[ -z "$TOKEN" ]]; then
  log "missing BONJOUR_TOKEN. Set BONJOUR_TOKEN or BONJOUR_TOKEN_SOURCE before running Batch B."
  exit 1
fi

log "batch B started"
log "source_auth_dir=$SOURCE_AUTH_DIR auth_dir=$AUTH_DIR raw_dir=$RAW_DIR"

bootstrap_auth_resume_dir

log "resuming batch B auth frontier max_nodes=$AUTH_MAX_NODES concurrency=$AUTH_CONCURRENCY"
BONJOUR_TOKEN="$TOKEN" "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-auth-handles \
  --resume "$AUTH_DIR" \
  --max-nodes "$AUTH_MAX_NODES" \
  --checkpoint-every "$AUTH_CHECKPOINT_EVERY" \
  --concurrency "$AUTH_CONCURRENCY" >> "$LOG_PATH" 2>&1

log "auth frontier stage finished"

if [[ ! -f "$AUTH_DIR/import-handles.json" ]]; then
  log "missing auth import-handles.json after auth stage"
  exit 1
fi

RAW_IMPORT_HANDLES_PATH="$AUTH_DIR/import-handles.json"
RAW_ENABLE_IMPORTED_TIMELINES=1
DELTA_IMPORT_HANDLES_PATH="$AUTH_DIR/import-handles.delta.json"
PREVIOUS_IMPORT_HANDLES_PATH="$SOURCE_AUTH_DIR/import-handles.json"

if [[ -f "$PREVIOUS_IMPORT_HANDLES_PATH" ]]; then
  log "building delta import handles against previous frontier + existing bonjour db coverage"
  FILTER_ARGS=(
    --input "$AUTH_DIR/import-handles.json"
    --exclude "$PREVIOUS_IMPORT_HANDLES_PATH"
    --output "$DELTA_IMPORT_HANDLES_PATH"
  )
  if [[ "$FILTER_RESOLVE_SOURCE_PROFILES" -eq 1 ]]; then
    FILTER_ARGS+=(--resolve-source-profiles --resolve-concurrency "$FILTER_RESOLVE_CONCURRENCY")
  fi

  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts filter-bonjour-import-handles \
    "${FILTER_ARGS[@]}" >> "$LOG_PATH" 2>&1

  DELTA_IMPORT_HANDLE_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$DELTA_IMPORT_HANDLES_PATH")"
  log "delta import handles count=$DELTA_IMPORT_HANDLE_COUNT"

  if [[ "$DELTA_IMPORT_HANDLE_COUNT" -gt 0 ]]; then
    RAW_IMPORT_HANDLES_PATH="$DELTA_IMPORT_HANDLES_PATH"
  else
    RAW_ENABLE_IMPORTED_TIMELINES=0
    log "delta import handles empty; raw dump will skip imported profile timeline expansion"
  fi
fi

if [[ -f "$RAW_DIR/manifest.json" ]]; then
  log "raw dump already exists, reusing $RAW_DIR"
elif [[ -d "$RAW_DIR" && -n "$(find "$RAW_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  log "raw dir exists without manifest: $RAW_DIR"
  exit 1
else
  log "starting raw dump with imported timelines, global timeline, and commenters"
  if [[ "$RAW_ENABLE_IMPORTED_TIMELINES" -eq 1 ]]; then
    "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-raw \
      --import-handles "$RAW_IMPORT_HANDLES_PATH" \
      --scan-imported-profile-timelines \
      --scan-global-timeline \
      --scan-commenters \
      --max-profile-pages-per-handle "$RAW_MAX_PROFILE_PAGES" \
      --timeline-concurrency "$RAW_TIMELINE_CONCURRENCY" \
      --profile-concurrency "$RAW_PROFILE_CONCURRENCY" \
      --comment-concurrency "$RAW_COMMENT_CONCURRENCY" \
      --output "$RAW_DIR" >> "$LOG_PATH" 2>&1
  else
    "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-raw \
      --scan-global-timeline \
      --scan-commenters \
      --timeline-concurrency "$RAW_TIMELINE_CONCURRENCY" \
      --profile-concurrency "$RAW_PROFILE_CONCURRENCY" \
      --comment-concurrency "$RAW_COMMENT_CONCURRENCY" \
      --output "$RAW_DIR" >> "$LOG_PATH" 2>&1
  fi
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

log "batch B finished"
