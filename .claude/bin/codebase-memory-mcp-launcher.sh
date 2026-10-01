#!/bin/bash
# Launcher for the codebase-memory-mcp MCP server, referenced from .mcp.json.
#
# Prefers a codebase-memory-mcp already on PATH (e.g. the user's own local
# install), and otherwise falls back to the copy the SessionStart hook
# (.claude/hooks/install-codebase-memory-mcp.sh) downloads into cloud
# sessions, since those start from a fresh container every time.
set -euo pipefail

FALLBACK="$HOME/.local/share/codebase-memory-mcp/codebase-memory-mcp"

if command -v codebase-memory-mcp >/dev/null 2>&1; then
  exec codebase-memory-mcp "$@"
fi

# The SessionStart hook may still be downloading the binary when Claude Code
# starts MCP servers, so give it a little time to appear.
for _ in $(seq 1 25); do
  [ -x "$FALLBACK" ] && break
  sleep 1
done

exec "$FALLBACK" "$@"
