#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
NODE_BIN="${NODE_BIN:-}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-300}"
ONCE=0
RUNNER_LOG_OVERRIDE="${RUNNER_LOG_OVERRIDE:-}"
PROGRESS_LOG_OVERRIDE="${PROGRESS_LOG_OVERRIDE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once)
      ONCE=1
      shift
      ;;
    --interval)
      INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --runner-log)
      RUNNER_LOG_OVERRIDE="$2"
      shift 2
      ;;
    --progress-log)
      PROGRESS_LOG_OVERRIDE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node executable not found. Set NODE_BIN or install node in PATH." >&2
  exit 1
fi

find_runner_log() {
  if [[ -n "$RUNNER_LOG_OVERRIDE" ]]; then
    printf '%s\n' "$RUNNER_LOG_OVERRIDE"
    return 0
  fi

  local exact
  exact="$(find "$REPO_DIR/output/bonjour-raw" -name 'bonjour-batch-a-runner.log' | sort | tail -n 1)"
  if [[ -n "$exact" ]]; then
    printf '%s\n' "$exact"
    return 0
  fi

  find "$REPO_DIR/output/bonjour-raw" -name 'bonjour-batch-a-runner*.log' | sort | tail -n 1
}

detect_batch_prefix() {
  local runner_log="$1"
  local base
  base="$(basename "$runner_log")"
  if [[ "$base" == *-runner.log ]]; then
    printf '%s\n' "${base%-runner.log}"
    return 0
  fi
  if [[ "$base" == *-runner-*.log ]]; then
    printf '%s\n' "${base%-runner-*.log}"
    return 0
  fi
  printf '%s\n' "bonjour-batch-a"
}

json_field() {
  local path="$1"
  local key="$2"
  "$NODE_BIN" -e '
    const fs = require("fs");
    const path = process.argv[1];
    const key = process.argv[2];
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    let current = data;
    for (const part of key.split(".")) {
      current = current?.[part];
    }
    if (current === undefined || current === null) process.exit(2);
    if (typeof current === "object") {
      console.log(JSON.stringify(current));
    } else {
      console.log(String(current));
    }
  ' "$path" "$key" 2>/dev/null
}

count_files() {
  local target="$1"
  if [[ ! -d "$target" ]]; then
    echo 0
    return 0
  fi

  find "$target" -type f 2>/dev/null | wc -l | awk '{print $1}'
}

latest_mtime() {
  local target="$1"
  if [[ ! -d "$target" ]]; then
    echo "n/a"
    return 0
  fi

  local latest
  latest="$(find "$target" -type f -print0 2>/dev/null | xargs -0 stat -f '%m %N' 2>/dev/null | sort -nr | head -n 1)"
  if [[ -z "$latest" ]]; then
    echo "n/a"
    return 0
  fi

  local epoch
  epoch="$(awk '{print $1}' <<<"$latest")"
  date -r "$epoch" '+%Y-%m-%d %H:%M:%S %Z'
}

process_state() {
  local pattern="$1"
  if /bin/ps -ax -o pid,ppid,etime,command 2>/dev/null | grep -v grep | grep -q "$pattern"; then
    echo "running"
  elif /bin/ps -ax -o pid,ppid,etime,command >/dev/null 2>&1; then
    echo "stopped"
  else
    echo "unknown"
  fi
}

current_stage() {
  local auth_process="$1"
  local raw_process="$2"
  local import_process="$3"
  local dedupe_process="$4"
  local coverage_process="$5"
  local raw_manifest="$6"

  if [[ "$coverage_process" == "running" ]]; then
    echo "coverage"
  elif [[ "$dedupe_process" == "running" ]]; then
    echo "dedupe"
  elif [[ "$import_process" == "running" ]]; then
    echo "import"
  elif [[ "$raw_process" == "running" ]]; then
    echo "raw_dump"
  elif [[ "$auth_process" == "running" ]]; then
    echo "auth_frontier"
  elif [[ -f "$raw_manifest" ]]; then
    echo "raw_completed"
  else
    echo "unknown_or_stopped"
  fi
}

emit_report() {
  local runner_log="$1"
  local run_dir auth_dir raw_dir auth_manifest raw_manifest progress_log batch_prefix
  run_dir="$(dirname "$runner_log")"
  batch_prefix="$(detect_batch_prefix "$runner_log")"
  auth_dir="$run_dir/${batch_prefix}-auth-frontier"
  raw_dir="$run_dir/${batch_prefix}-raw"
  auth_manifest="$auth_dir/manifest.json"
  raw_manifest="$raw_dir/manifest.json"
  progress_log="${PROGRESS_LOG_OVERRIDE:-$run_dir/bonjour-batch-a-progress.log}"

  mkdir -p "$(dirname "$progress_log")"

  local auth_status="n/a"
  local auth_fetched="0"
  local auth_discovered="0"
  local auth_errors="0"
  if [[ -f "$auth_manifest" ]]; then
    auth_status="$(json_field "$auth_manifest" "status" || echo n/a)"
    auth_fetched="$(json_field "$auth_manifest" "fetchedNodes" || echo 0)"
    auth_discovered="$(json_field "$auth_manifest" "discoveredHandles" || echo 0)"
    auth_errors="$(json_field "$auth_manifest" "errorCount" || echo 0)"
  fi

  local raw_total raw_profiles raw_comments raw_manifest_state raw_unique_handles raw_posts raw_profiles_dumped
  raw_total="$(count_files "$raw_dir")"
  raw_profiles="$(count_files "$raw_dir/profiles")"
  raw_comments="$(count_files "$raw_dir/comments")"
  raw_manifest_state="pending"
  raw_unique_handles="n/a"
  raw_posts="n/a"
  raw_profiles_dumped="n/a"
  if [[ -f "$raw_manifest" ]]; then
    raw_manifest_state="ready"
    raw_unique_handles="$(json_field "$raw_manifest" "uniqueHandles" || echo n/a)"
    raw_posts="$(json_field "$raw_manifest" "postsScanned" || echo n/a)"
    raw_profiles_dumped="$(json_field "$raw_manifest" "profilesDumped" || echo n/a)"
  fi

  local auth_process raw_process import_process dedupe_process coverage_process stage latest_write
  auth_process="$(process_state 'apps/worker/src/cli.ts dump-bonjour-auth-handles')"
  raw_process="$(process_state 'apps/worker/src/cli.ts dump-bonjour-raw')"
  import_process="$(process_state 'apps/worker/src/cli.ts import-bonjour-dump')"
  dedupe_process="$(process_state 'apps/worker/src/cli.ts dedupe-bonjour')"
  coverage_process="$(process_state 'apps/worker/src/cli.ts coverage --json')"
  stage="$(current_stage "$auth_process" "$raw_process" "$import_process" "$dedupe_process" "$coverage_process" "$raw_manifest")"
  latest_write="$(latest_mtime "$raw_dir")"

  local recent_log
  recent_log="$(tail -n 5 "$runner_log" 2>/dev/null | sed 's/^/  /')"

  {
    echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] ${batch_prefix} Progress"
    echo "run_dir: $run_dir"
    echo "batch_prefix: $batch_prefix"
    echo "stage: $stage"
    echo "processes: auth=$auth_process raw=$raw_process import=$import_process dedupe=$dedupe_process coverage=$coverage_process"
    echo "auth: status=$auth_status fetched=$auth_fetched discovered=$auth_discovered errors=$auth_errors"
    echo "raw: manifest=$raw_manifest_state total_files=$raw_total profiles=$raw_profiles comments=$raw_comments unique_handles=$raw_unique_handles posts=$raw_posts profiles_dumped=$raw_profiles_dumped latest_write=$latest_write"
    echo "recent_log:"
    echo "$recent_log"
    echo
  } | tee -a "$progress_log"
}

main() {
  local runner_log
  runner_log="$(find_runner_log)"
  if [[ -z "$runner_log" || ! -f "$runner_log" ]]; then
    echo "No bonjour-batch-a runner log found under $REPO_DIR/output/bonjour-raw" >&2
    exit 1
  fi

  while true; do
    emit_report "$runner_log"
    if [[ "$ONCE" -eq 1 ]]; then
      break
    fi
    sleep "$INTERVAL_SECONDS"
  done
}

main
