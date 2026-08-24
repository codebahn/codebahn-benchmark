#!/usr/bin/env bash
set -euo pipefail

# Raw API latency benchmark: curl timing against equivalent REST endpoints.
# No MCP, no agent, no LLM. Just HTTP round-trips.
#
# Usage:
#   ./api-bench.sh <codebahn-token> <github-token> [iterations]
#
# Repos must exist: hackerman/data-utils (Codebahn), simonnordberg/data-utils (GitHub)
# Override with CB_OWNER/CB_REPO/GH_OWNER/GH_REPO env vars.

CB_TOKEN="${1:?Usage: ./api-bench.sh <codebahn-token> <github-token> [iterations]}"
GH_TOKEN="${2:?Usage: ./api-bench.sh <codebahn-token> <github-token> [iterations]}"
ITERATIONS="${3:-50}"

CB_BASE="https://codebahn.net/api/v1"
GH_BASE="https://api.github.com"
CB_OWNER="${CB_OWNER:-hackerman}"
CB_REPO="${CB_REPO:-data-utils}"
GH_OWNER="${GH_OWNER:-simonnordberg}"
GH_REPO="${GH_REPO:-data-utils}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/api-results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

# Endpoints to benchmark (matched operations on both platforms)
declare -a LABELS=(
  "List issues"
  "Get issue #1"
  "List repo contents"
  "Get file content"
  "List commits"
  "List branches"
  "List pull requests"
)

declare -a CB_PATHS=(
  "/repos/$CB_OWNER/$CB_REPO/issues"
  "/repos/$CB_OWNER/$CB_REPO/issues/1"
  "/repos/$CB_OWNER/$CB_REPO/contents/"
  "/repos/$CB_OWNER/$CB_REPO/contents/src/validate.ts"
  "/repos/$CB_OWNER/$CB_REPO/commits?limit=5"
  "/repos/$CB_OWNER/$CB_REPO/branches"
  "/repos/$CB_OWNER/$CB_REPO/pulls"
)

declare -a GH_PATHS=(
  "/repos/$GH_OWNER/$GH_REPO/issues"
  "/repos/$GH_OWNER/$GH_REPO/issues/1"
  "/repos/$GH_OWNER/$GH_REPO/contents/"
  "/repos/$GH_OWNER/$GH_REPO/contents/src/validate.ts"
  "/repos/$GH_OWNER/$GH_REPO/commits?per_page=5"
  "/repos/$GH_OWNER/$GH_REPO/branches"
  "/repos/$GH_OWNER/$GH_REPO/pulls"
)

NUM_ENDPOINTS=${#LABELS[@]}

echo "Codebahn vs GitHub: Raw API Latency"
echo "  CB: $CB_BASE ($CB_OWNER/$CB_REPO)"
echo "  GH: $GH_BASE ($GH_OWNER/$GH_REPO)"
echo "  Iterations: $ITERATIONS per endpoint"
echo "  Endpoints: $NUM_ENDPOINTS"
echo "  Output: $OUT_DIR"
echo ""

# Warm up DNS/TLS
curl -s -o /dev/null "$CB_BASE/repos/$CB_OWNER/$CB_REPO" -H "Authorization: token $CB_TOKEN"
curl -s -o /dev/null "$GH_BASE/repos/$GH_OWNER/$GH_REPO" -H "Authorization: token $GH_TOKEN"

# Run benchmarks
for idx in $(seq 0 $((NUM_ENDPOINTS - 1))); do
  label="${LABELS[$idx]}"
  cb_path="${CB_PATHS[$idx]}"
  gh_path="${GH_PATHS[$idx]}"
  cb_file="$OUT_DIR/cb-$idx.txt"
  gh_file="$OUT_DIR/gh-$idx.txt"

  printf "  %-24s " "$label"

  for i in $(seq 1 "$ITERATIONS"); do
    curl -s -o /dev/null -w "%{time_total}\n" \
      "$CB_BASE$cb_path" \
      -H "Authorization: token $CB_TOKEN" \
      -H "Accept: application/json" \
      >> "$cb_file" &

    curl -s -o /dev/null -w "%{time_total}\n" \
      "$GH_BASE$gh_path" \
      -H "Authorization: token $GH_TOKEN" \
      -H "Accept: application/json" \
      >> "$gh_file" &

    wait
  done

  # Compute stats
  cb_p50=$(sort -n "$cb_file" | awk "NR==int($ITERATIONS*0.5){print}")
  cb_p95=$(sort -n "$cb_file" | awk "NR==int($ITERATIONS*0.95){print}")
  gh_p50=$(sort -n "$gh_file" | awk "NR==int($ITERATIONS*0.5){print}")
  gh_p95=$(sort -n "$gh_file" | awk "NR==int($ITERATIONS*0.95){print}")

  cb_p50_ms=$(echo "$cb_p50 * 1000" | bc | cut -d. -f1)
  gh_p50_ms=$(echo "$gh_p50 * 1000" | bc | cut -d. -f1)
  cb_p95_ms=$(echo "$cb_p95 * 1000" | bc | cut -d. -f1)
  gh_p95_ms=$(echo "$gh_p95 * 1000" | bc | cut -d. -f1)

  ratio="$(echo "scale=1; $gh_p50 / $cb_p50" | bc)x"

  printf "CB p50: %4dms p95: %4dms  GH p50: %4dms p95: %4dms  %s\n" \
    "$cb_p50_ms" "$cb_p95_ms" "$gh_p50_ms" "$gh_p95_ms" "$ratio"
done

echo ""

# Overall summary
all_cb=$(cat "$OUT_DIR"/cb-*.txt | sort -n)
all_gh=$(cat "$OUT_DIR"/gh-*.txt | sort -n)
total_cb=$(echo "$all_cb" | wc -l)
total_gh=$(echo "$all_gh" | wc -l)

cb_overall_p50=$(echo "$all_cb" | awk "NR==int($total_cb*0.5){print}")
gh_overall_p50=$(echo "$all_gh" | awk "NR==int($total_gh*0.5){print}")
cb_overall_p95=$(echo "$all_cb" | awk "NR==int($total_cb*0.95){print}")
gh_overall_p95=$(echo "$all_gh" | awk "NR==int($total_gh*0.95){print}")

cb_p50_ms=$(echo "$cb_overall_p50 * 1000" | bc | cut -d. -f1)
gh_p50_ms=$(echo "$gh_overall_p50 * 1000" | bc | cut -d. -f1)
cb_p95_ms=$(echo "$cb_overall_p95 * 1000" | bc | cut -d. -f1)
gh_p95_ms=$(echo "$gh_overall_p95 * 1000" | bc | cut -d. -f1)
overall_ratio="$(echo "scale=1; $gh_overall_p50 / $cb_overall_p50" | bc)x"

echo "  Overall ($((ITERATIONS * NUM_ENDPOINTS)) calls each)"
echo "    Codebahn  p50: ${cb_p50_ms}ms  p95: ${cb_p95_ms}ms"
echo "    GitHub    p50: ${gh_p50_ms}ms  p95: ${gh_p95_ms}ms"
echo "    Ratio:    ${overall_ratio}"

# Write JSON
cat > "$OUT_DIR/results.json" <<ENDJSON
{
  "timestamp": "$(date -Iseconds)",
  "iterations": $ITERATIONS,
  "location": "$(curl -s https://ipinfo.io/city 2>/dev/null || echo unknown)",
  "endpoints": [
$(for idx in $(seq 0 $((NUM_ENDPOINTS - 1))); do
  label="${LABELS[$idx]}"
  cb_file="$OUT_DIR/cb-$idx.txt"
  gh_file="$OUT_DIR/gh-$idx.txt"
  cb_p50=$(sort -n "$cb_file" | awk "NR==int($ITERATIONS*0.5){printf \"%.0f\", \$1*1000}")
  cb_p95=$(sort -n "$cb_file" | awk "NR==int($ITERATIONS*0.95){printf \"%.0f\", \$1*1000}")
  gh_p50=$(sort -n "$gh_file" | awk "NR==int($ITERATIONS*0.5){printf \"%.0f\", \$1*1000}")
  gh_p95=$(sort -n "$gh_file" | awk "NR==int($ITERATIONS*0.95){printf \"%.0f\", \$1*1000}")
  comma=""
  [ "$idx" -lt $((NUM_ENDPOINTS - 1)) ] && comma=","
  echo "    {\"label\": \"$label\", \"cb_p50\": $cb_p50, \"cb_p95\": $cb_p95, \"gh_p50\": $gh_p50, \"gh_p95\": $gh_p95}$comma"
done)
  ],
  "overall": {
    "cb_p50": $cb_p50_ms,
    "cb_p95": $cb_p95_ms,
    "gh_p50": $gh_p50_ms,
    "gh_p95": $gh_p95_ms
  }
}
ENDJSON

echo ""
echo "  Results: $OUT_DIR/results.json"
