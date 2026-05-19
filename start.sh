#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true
npm start
