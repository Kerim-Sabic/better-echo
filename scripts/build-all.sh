#!/bin/bash

set -e

echo "=========================================="
echo "Building Echocardiology Desktop App"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

echo "Step 1: Building Electron main process..."
npm run build:electron

echo ""
echo "Step 2: Building React frontend..."
npm run build:frontend

echo ""
echo "Step 3: Building Python backend with PyInstaller..."
echo "  (This may take several minutes...)"
npm run build:backend

echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo ""
echo "Backend executable: backend/dist/api/"
echo "Frontend build: frontend/build/"
echo "Electron build: dist/electron/"
echo ""
echo "Next step: Run 'npm run dist' to create installers"
echo ""
