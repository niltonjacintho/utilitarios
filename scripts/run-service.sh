#!/usr/bin/env bash
set -euo pipefail

PID_FILE="$1"
NODE_BIN_DIR="$2"
WORKDIR="$3"
shift 3

echo "$$" >> "$PID_FILE"
export PATH="$NODE_BIN_DIR:$PATH"
cd "$WORKDIR"
exec "$@"
