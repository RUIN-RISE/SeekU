#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
BATCH_TAG="${BATCH_TAG:-bonjour-batch-d-auth-probe}"
AUTH_DIR="$REPO_DIR/output/bonjour-raw/$RUN_DATE/$BATCH_TAG"
LOG_PATH="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${BATCH_TAG}-runner.log"
SEED_FILE="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${BATCH_TAG}-seeds.json"
DELTA_IMPORT_HANDLES_PATH="$AUTH_DIR/delta-import-handles.json"
PREVIOUS_IMPORT_HANDLES_PATH="${PREVIOUS_IMPORT_HANDLES_PATH:-$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-auth-frontier/import-handles.json}"
AUTH_MAX_NODES="${AUTH_MAX_NODES:-200}"
AUTH_CONCURRENCY="${AUTH_CONCURRENCY:-8}"
AUTH_CHECKPOINT_EVERY="${AUTH_CHECKPOINT_EVERY:-50}"
SEED_LIMIT="${SEED_LIMIT:-200}"
SEED_MIN_OCCURRENCES="${SEED_MIN_OCCURRENCES:-2}"
FILTER_RESOLVE_CONCURRENCY="${FILTER_RESOLVE_CONCURRENCY:-8}"
RUN_DELTA_PIPELINE="${RUN_DELTA_PIPELINE:-1}"

RAW_HANDLE_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-raw-auth-depth2-plus-depth3-full-plus-depth4-batch2-expanded-profiles-2026-04-08T09-22Z/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-raw/handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-raw/handles.json"
)

EXCLUDE_HANDLE_FILES=(
  "$REPO_DIR/output/bonjour-raw/2026-04-08/bonjour-auth-handles-depth5-batch3-top1000-2026-04-08T10-32Z/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-10/bonjour-batch-a-auth-frontier/import-handles.json"
  "$REPO_DIR/output/bonjour-raw/2026-04-11/bonjour-batch-b-auth-frontier/import-handles.json"
)

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

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  log "node executable not found. Set NODE_BIN or install node in PATH."
  exit 1
fi

TOKEN="$(resolve_bonjour_token || true)"
if [[ -z "$TOKEN" ]]; then
  log "missing BONJOUR_TOKEN. Set BONJOUR_TOKEN or BONJOUR_TOKEN_SOURCE before running Batch D."
  exit 1
fi

BUILD_ARGS=(
  --output "$SEED_FILE"
  --limit "$SEED_LIMIT"
  --min-occurrences "$SEED_MIN_OCCURRENCES"
  --require-category-visible
  --require-profile-name
)

for file in "${RAW_HANDLE_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    BUILD_ARGS+=(--input "$file")
  fi
done

for file in "${EXCLUDE_HANDLE_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    BUILD_ARGS+=(--exclude "$file")
  fi
done

log "batch D started"
log "building auth probe seeds output=$SEED_FILE"
"$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts build-bonjour-auth-probe-seeds \
  "${BUILD_ARGS[@]}" >> "$LOG_PATH" 2>&1

SEED_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$SEED_FILE")"
log "seed_count=$SEED_COUNT"

if [[ "$SEED_COUNT" -eq 0 ]]; then
  log "seed file empty; stopping"
  exit 0
fi

if [[ -f "$AUTH_DIR/manifest.json" ]]; then
  log "auth probe already exists, reusing $AUTH_DIR"
else
  log "starting auth probe depth=0 max_nodes=$AUTH_MAX_NODES concurrency=$AUTH_CONCURRENCY"
  BONJOUR_TOKEN="$TOKEN" "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts dump-bonjour-auth-handles \
    --seed-file "$SEED_FILE" \
    --depth 0 \
    --max-nodes "$AUTH_MAX_NODES" \
    --checkpoint-every "$AUTH_CHECKPOINT_EVERY" \
    --concurrency "$AUTH_CONCURRENCY" \
    --output "$AUTH_DIR" >> "$LOG_PATH" 2>&1
fi

log "auth probe finished"

if [[ ! -f "$AUTH_DIR/import-handles.json" ]]; then
  log "missing auth import-handles.json after auth probe"
  exit 1
fi

if [[ -f "$PREVIOUS_IMPORT_HANDLES_PATH" ]]; then
  log "filtering probe handles against previous auth frontier + db coverage"
  "$NODE_BIN" --import tsx/esm apps/worker/src/cli.ts filter-bonjour-import-handles \
    --input "$AUTH_DIR/import-handles.json" \
    --exclude "$PREVIOUS_IMPORT_HANDLES_PATH" \
    --resolve-source-profiles \
    --resolve-concurrency "$FILTER_RESOLVE_CONCURRENCY" \
    --output "$DELTA_IMPORT_HANDLES_PATH" >> "$LOG_PATH" 2>&1

  DELTA_COUNT="$("$NODE_BIN" -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).length)' "$DELTA_IMPORT_HANDLES_PATH")"
  log "delta_import_handle_count=$DELTA_COUNT"

  if [[ "$RUN_DELTA_PIPELINE" -eq 1 && "$DELTA_COUNT" -gt 0 ]]; then
    log "running delta pipeline from probe handles"
    RUN_DATE="$RUN_DATE" \
    BATCH_TAG="${BATCH_TAG}-delta" \
    DELTA_IMPORT_HANDLES_PATH="$DELTA_IMPORT_HANDLES_PATH" \
    /bin/bash "$REPO_DIR/scripts/run_bonjour_delta_batch.sh" >> "$LOG_PATH" 2>&1
  fi
fi

log "batch D finished"
