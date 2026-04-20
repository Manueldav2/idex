#!/usr/bin/env bash
# Convenience: run desktop + landing in parallel for full local preview
set -e
cd "$(dirname "$0")/.."

pnpm install

echo "▸ starting landing on http://localhost:5180"
pnpm --filter @idex/landing dev &
LANDING_PID=$!

echo "▸ starting desktop electron app"
pnpm --filter @idex/desktop dev &
DESKTOP_PID=$!

trap "kill $LANDING_PID $DESKTOP_PID 2>/dev/null || true" EXIT

wait
