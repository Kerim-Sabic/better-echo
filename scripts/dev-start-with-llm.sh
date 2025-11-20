#!/bin/bash

echo "Starting Echocardiology Desktop App in DEV mode with LLM..."
echo ""
echo "This will:"
echo "  - Start the local LLM (if scripts/start_llm.sh exists)"
echo "  - Start Orthanc/backend/frontend/Electron dev stack (via scripts/dev-start.sh)"
echo ""

cd "$(dirname "$0")/.."

LLM_START="./scripts/start_llm.sh"
LLM_STOP="./scripts/stop_llm.sh"

if [ -x "$LLM_START" ]; then
  echo "Starting LLM (background)..."
  "$LLM_START" &
  LLM_PID=$!
else
  echo "LLM start script not found at $LLM_START. Start it manually if needed."
fi

"./scripts/dev-start.sh"

if [ -n "$LLM_PID" ] && kill -0 "$LLM_PID" 2>/dev/null; then
  if [ -x "$LLM_STOP" ]; then
    echo "Stopping LLM..."
    "$LLM_STOP"
  else
    echo "LLM stop script not found at $LLM_STOP. Please stop it manually."
  fi
fi
