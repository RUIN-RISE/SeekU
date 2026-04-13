#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/rosscai/seeku"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
CAMPAIGN_TAG="${CAMPAIGN_TAG:-bonjour-batch-g-frontiers}"
LOG_PATH="$REPO_DIR/output/bonjour-raw/$RUN_DATE/${CAMPAIGN_TAG}-runner.log"

STAGES=(
  "bonjour-batch-g0-import-comment|$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-g0-import-comment-seeds.json|external_import + post_comment"
  "bonjour-batch-g1-comment-no-name-occ2|$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-g1-comment-no-name-occ2-seeds.json|comment-only no-name occ>=2"
  "bonjour-batch-g2-import-any|$REPO_DIR/output/bonjour-raw/$RUN_DATE/bonjour-batch-g2-import-any-seeds.json|external_import residual tail"
)

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_PATH"
}

cd "$REPO_DIR"

log "frontier campaign started tag=$CAMPAIGN_TAG run_date=$RUN_DATE"

for spec in "${STAGES[@]}"; do
  IFS='|' read -r batch_tag seed_file description <<<"$spec"

  if [[ ! -f "$seed_file" ]]; then
    log "skip batch_tag=$batch_tag missing_seed_file=$seed_file"
    continue
  fi

  log "starting batch_tag=$batch_tag description=$description seed_file=$seed_file"
  RUN_DATE="$RUN_DATE" \
  BATCH_TAG="$batch_tag" \
  SEED_FILE="$seed_file" \
  /bin/bash "$REPO_DIR/scripts/run_bonjour_auth_probe_from_seed_file.sh" >> "$LOG_PATH" 2>&1
  log "finished batch_tag=$batch_tag"
done

log "frontier campaign finished tag=$CAMPAIGN_TAG"
