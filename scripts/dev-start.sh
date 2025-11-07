#!/bin/bash

echo "Starting Echocardiology Desktop App in DEV mode..."
echo ""
echo "This will start:"
echo "  1. FastAPI backend on http://127.0.0.1:8000"
echo "  2. React frontend on http://localhost:3000"
echo "  3. Electron app connecting to both"
echo ""

cd "$(dirname "$0")/.."

echo "Checking Docker and starting Orthanc (Docker Compose)..."
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yml up -d orthanc && echo "Orthanc started via 'docker compose'." || echo "Failed to start Orthanc via 'docker compose'."
  else
    if command -v docker-compose >/dev/null 2>&1; then
      docker-compose -f docker-compose.yml up -d orthanc || echo "Failed to start Orthanc via 'docker-compose'."
    else
      echo "Neither 'docker compose' nor 'docker-compose' found. Skipping Orthanc startup."
    fi
  fi
else
  echo "Docker is not available. Skipping Orthanc startup."
fi

if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

if [ ! -d "backend/app/logs" ]; then
    mkdir -p backend/app/logs
fi

npm run build:electron

npm run dev
