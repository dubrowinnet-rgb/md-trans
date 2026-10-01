#!/bin/bash
# SessionStart hook: installs the codebase-memory-mcp binary so the
# codebase-memory-mcp MCP server (configured in the repo's .mcp.json) is
# available inside Claude Code cloud sessions, which start from a fresh
# container on every session and have no access to anything installed on
# the user's own machine.
#
# Idempotent: skips the download if a working binary of the pinned version
# is already in place. Safe to re-run.
set -euo pipefail

VERSION="0.11.0"
INSTALL_DIR="$HOME/.local/share/codebase-memory-mcp"
BIN_PATH="$INSTALL_DIR/codebase-memory-mcp"
REPO="DeusData/codebase-memory-mcp"

# Expected sha256 for each released asset we might need, pinned to $VERSION.
# (from https://github.com/$REPO/releases/download/v$VERSION/checksums.txt)
checksum_for() {
  case "$1" in
    codebase-memory-mcp-linux-amd64-portable.tar.gz)
      echo "1f9e8293eb2bc5c05cfa27a7e8fc033da6d729ffad525ccfcdaa3fd606306683" ;;
    codebase-memory-mcp-linux-arm64-portable.tar.gz)
      echo "d62eeb224d5ee3eba3070938ec62cf1033f10b041ec1c4b2fb67f7aef390cc7b" ;;
    *)
      echo "" ;;
  esac
}

# If the user already has a working codebase-memory-mcp on PATH (e.g. a
# local, non-cloud Claude Code run on a machine where they installed it
# themselves), use that instead of downloading our own copy.
if command -v codebase-memory-mcp >/dev/null 2>&1; then
  exit 0
fi

# Already installed at the pinned version from a previous session start?
if [ -x "$BIN_PATH" ] && "$BIN_PATH" --version 2>/dev/null | grep -q "$VERSION"; then
  exit 0
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux) PLATFORM="linux" ;;
  *)
    # Only Linux cloud containers are supported by this hook; elsewhere
    # (e.g. the user's own machine) they manage their own install.
    exit 0
    ;;
esac

case "$ARCH" in
  x86_64|amd64) GOARCH="amd64" ;;
  aarch64|arm64) GOARCH="arm64" ;;
  *) exit 0 ;;
esac

ASSET="codebase-memory-mcp-${PLATFORM}-${GOARCH}-portable.tar.gz"
EXPECTED_SHA256="$(checksum_for "$ASSET")"
if [ -z "$EXPECTED_SHA256" ]; then
  exit 0
fi

URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! curl -fsSL -o "$TMP_DIR/$ASSET" "$URL"; then
  echo "codebase-memory-mcp: download failed, skipping install" >&2
  exit 0
fi

ACTUAL_SHA256="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "codebase-memory-mcp: checksum mismatch, skipping install" >&2
  exit 0
fi

mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
mv -f "$TMP_DIR/codebase-memory-mcp" "$BIN_PATH"
chmod +x "$BIN_PATH"

exit 0
