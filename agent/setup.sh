#!/usr/bin/env bash
set -euo pipefail

# Create labels and issues on a platform via MCP.
#
# Usage:
#   ./setup.sh codebahn <owner> <repo>
#   ./setup.sh github   <owner> <repo>

PLATFORM="${1:?Usage: ./setup.sh <codebahn|github> <owner> <repo>}"
OWNER="${2:?Usage: ./setup.sh <platform> <owner> <repo>}"
REPO="${3:?Usage: ./setup.sh <platform> <owner> <repo>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_CONFIG="$SCRIPT_DIR/mcp-${PLATFORM}.json"

if [ ! -f "$MCP_CONFIG" ]; then
  echo "MCP config not found: $MCP_CONFIG"
  echo ""
  echo "Copy the example and fill in your token:"
  echo "  cp mcp-${PLATFORM}.example.json mcp-${PLATFORM}.json"
  exit 1
fi

PROMPT="$(cat "$SCRIPT_DIR/setup.md")"
PROMPT="${PROMPT//\{owner\}\/{repo\}/$OWNER/$REPO}"

echo "Setting up issues on $PLATFORM ($OWNER/$REPO)..."

claude \
  --print \
  --mcp-config "$MCP_CONFIG" \
  --permission-mode bypassPermissions \
  --max-turns 20 \
  --prompt "$PROMPT"

echo ""
echo "Done. Issues created on $PLATFORM."
