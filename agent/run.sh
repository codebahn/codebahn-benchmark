#!/usr/bin/env bash
set -euo pipefail

# Run the agent benchmark against one platform.
#
# Usage:
#   ./run.sh <platform> <owner> <repo> [task]
#
# Tasks (in agent/tasks/):
#   fix-email    - fix the email validation bug (default)
#   fix-currency - fix the currency formatting bug
#   review-pr    - review an open pull request
#   review-defects - review the fixture PR, scored against src/defects.ts
#   explore      - read-only exploration of the repo
#
# Arms (--arm, for review-defects):
#   after   - every tool, the default
#   before  - hides the review tools added in codebahn-forgejo#240, so the
#             agent has to work from the squashed diff the way it used to
#
# Prerequisites:
#   - Repo bootstrapped with issues
#   - MCP config: copy mcp-<platform>.example.json to mcp-<platform>.json

PLATFORM="${1:?Usage: ./run.sh <codebahn|github> <owner> <repo> [task]}"
OWNER="${2:?Usage: ./run.sh <platform> <owner> <repo> [task]}"
REPO="${3:?Usage: ./run.sh <platform> <owner> <repo> [task]}"
TASK_NAME="${4:-fix-email}"
ARM="after"
if [ "${5:-}" = "--arm" ]; then
  ARM="${6:?--arm needs a value: before or after}"
fi

# The before arm reconstructs the pre-#240 toolset on the current binary.
REVIEW_TOOLS="mcp__codebahn__compare_refs mcp__codebahn__list_pr_commits mcp__codebahn__get_commit_diff"
case "$ARM" in
  after) DISALLOWED="" ;;
  before) DISALLOWED="$REVIEW_TOOLS" ;;
  *) echo "Unknown arm: $ARM (expected before or after)"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK_FILE="$SCRIPT_DIR/tasks/${TASK_NAME}.md"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$SCRIPT_DIR/results/${TASK_NAME}-${PLATFORM}-${ARM}-${TIMESTAMP}"
MCP_CONFIG="$SCRIPT_DIR/mcp-${PLATFORM}.json"

if [ ! -f "$TASK_FILE" ]; then
  echo "Task not found: $TASK_FILE"
  echo ""
  echo "Available tasks:"
  ls "$SCRIPT_DIR/tasks/"*.md 2>/dev/null | xargs -I{} basename {} .md | sed 's/^/  /'
  exit 1
fi

if [ ! -f "$MCP_CONFIG" ]; then
  echo "MCP config not found: $MCP_CONFIG"
  echo ""
  echo "Copy the example and fill in your token:"
  echo "  cp mcp-${PLATFORM}.example.json mcp-${PLATFORM}.json"
  exit 1
fi

mkdir -p "$OUT_DIR"

TASK="$(cat "$TASK_FILE")"
PROMPT="${TASK//\{owner\}\/{repo\}/$OWNER/$REPO}"

echo "Codebahn Bench"
echo "  Platform:  $PLATFORM"
echo "  Task:      $TASK_NAME"
echo "  Arm:       $ARM${DISALLOWED:+ (hiding the review tools)}"
echo "  Repo:      ${OWNER}/${REPO}"
echo "  Output:    $OUT_DIR"
echo "---"

# shellcheck disable=SC2086  # DISALLOWED is a deliberate word list
claude \
  --print \
  --verbose \
  --output-format stream-json \
  --mcp-config "$MCP_CONFIG" \
  --permission-mode bypassPermissions \
  --max-turns 40 \
  ${DISALLOWED:+--disallowedTools $DISALLOWED} \
  -p "$PROMPT" \
  2>"$OUT_DIR/stderr.log" \
  | tee "$OUT_DIR/stream.jsonl"

echo ""
echo "Done. Transcript: $OUT_DIR/stream.jsonl"
echo "Parse: pnpm parse $OUT_DIR/stream.jsonl"
echo "Score: pnpm score $OUT_DIR/stream.jsonl"
