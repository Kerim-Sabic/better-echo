# Echocardiology Desktop App - Setup & Packaging Guide

## Overview

This guide explains how to develop, build, and package the Echocardiology application as a cross-platform desktop application using Electron. The desktop app runs completely offline with a bundled FastAPI backend, AI models, and React frontend.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Development Workflow](#development-workflow)
4. [Building the Application](#building-the-application)
5. [Creating Installers](#creating-installers)
6. [Offline Testing](#offline-testing)
7. [Troubleshooting](#troubleshooting)
8. [Architecture](#architecture)

---

## Prerequisites

### Required Software

1. **Node.js** (LTS version 20.x or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version` and `npm --version`

2. **Python 3.11 or 3.12**
   - Download from: https://www.python.org/downloads/
   - Verify: `python --version` or `python3 --version`
   - **Important**: Make sure Python is added to PATH during installation

3. **PyInstaller** (for backend packaging)
   - Will be installed via: `pip install pyinstaller`

4. **Git** (for version control)
   - Download from: https://git-scm.com/

### Platform-Specific Requirements

#### Windows
- Windows 10 or later
- Visual Studio Build Tools (for native Node modules)
- CUDA toolkit (if using GPU acceleration)

#### macOS
- macOS 10.13 or later
- Xcode Command Line Tools: `xcode-select --install`

#### Linux
- Ubuntu 18.04+ or equivalent
- Build essentials: `sudo apt-get install build-essential`
- Additional dependencies: `sudo apt-get install libxtst6 libxss1 libgconf-2-4 libnss3`

---

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Affan88888/Echocardiology_App.git
cd Echocardiology_App
```

### 2. Install Dependencies

#### Install Root Dependencies
```bash
npm install
```

This will automatically install frontend dependencies as well (via postinstall script).

#### Install Python Dependencies
```bash
cd backend
pip install -r requirements.txt
pip install pyinstaller
cd ..
```

### 3. Environment Configuration

#### Backend Environment
Edit `backend/.env` with your configuration:
```env
CORS_ORIGIN=["http://localhost:3000"]
ORTHANC_URL="http://localhost:8042"
ORTHANC_USER="orthanc"
ORTHANC_PASS="orthanc"
SECRET_KEY=your-secret-key-here
TOKEN_EXPIRE_HOURS=4
```

#### Frontend Environment
The `frontend/.env` file should contain:
```env
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_API_URL_UPLOADS=http://localhost:8000/uploads
PORT=3000
```

---

## Development Workflow

### Quick Start (All Platforms)

#### Using Helper Scripts

**Windows:**
```cmd
scripts\dev-start.bat
```

**macOS/Linux:**
```bash
./scripts/dev-start.sh
```

#### Manual Start

If you prefer to run components separately:

```bash
# Terminal 1: Build Electron TypeScript
npm run build:electron

# Terminal 2: Start Backend
npm run dev:backend

# Terminal 3: Start Frontend
npm run dev:frontend

# Terminal 4: Start Electron (after frontend is ready)
npm run dev:electron
```

### What Runs in Development Mode

1. **FastAPI Backend** → http://127.0.0.1:8000
2. **React Frontend** → http://localhost:3000
3. **Electron App** → Loads frontend and connects to backend

The Electron window will open automatically and load the React dev server.

---

## Building the Application

### Full Build Process

Use the provided build script for a complete build:

**Windows:**
```cmd
scripts\build-all.bat
```

**macOS/Linux:**
```bash
./scripts/build-all.sh
```

### Step-by-Step Build

#### 1. Build Electron Main Process
```bash
npm run build:electron
```
Output: `dist/electron/` directory

#### 2. Build React Frontend
```bash
npm run build:frontend
```
Output: `frontend/build/` directory

#### 3. Build Python Backend (PyInstaller)
```bash
npm run build:backend
```
Output: `backend/dist/api/` directory

**Important Notes:**
- Backend build may take 5-15 minutes depending on your system
- PyInstaller will create a self-contained executable with all Python dependencies
- AI model files are NOT bundled; they're packaged separately as extraResources

---

## Creating Installers

### All Platforms
```bash
npm run dist
```

### Platform-Specific Builds

#### Windows (NSIS Installer)
```bash
npm run dist:win
```
Output: `dist/Echocardiology App Setup X.X.X.exe`

#### macOS (DMG)
```bash
npm run dist:mac
```
Output: `dist/Echocardiology App-X.X.X.dmg`

Note: macOS builds on macOS create both x64 and arm64 (Apple Silicon) versions

#### Linux (AppImage & DEB)
```bash
npm run dist:linux
```
Output:
- `dist/Echocardiology-App-X.X.X.AppImage`
- `dist/echocardiology-app_X.X.X_amd64.deb`

### Installer Configuration

The installer behavior is configured in `electron-builder.config.js`:
- **ASAR Archive**: Code is packaged into app.asar for integrity
- **Extra Resources**: Backend executable and AI models are extracted
- **Auto-Updates**: Disabled by default (can be configured later)

---

## Offline Testing

### Pre-Flight Checklist

Before distributing the app, verify it works completely offline:

#### 1. Install the Application
- Run the installer created by electron-builder
- Install to a test location

#### 2. Disconnect from Internet
- Turn off WiFi or disconnect Ethernet
- Verify no network connectivity

#### 3. Launch Application
- Start the installed app
- Verify the Electron window opens

#### 4. Backend Health Check
Open Developer Tools (Ctrl+Shift+I or Cmd+Option+I) and check console:
- Should see: "Backend health check passed on port XXXX"
- Should NOT see any network errors or failed requests to external URLs

#### 5. Test Core Functionality
- Try to login/register
- Upload a test DICOM file
- Run at least one inference operation
- Verify results display correctly

#### 6. Check Logs
Log files location:
- **Windows**: `%APPDATA%\Echocardiology App\logs\`
- **macOS**: `~/Library/Application Support/Echocardiology App/logs/`
- **Linux**: `~/.config/Echocardiology App/logs/`

---

## Troubleshooting

### Common Issues

#### Backend Fails to Start

**Symptom:** Electron opens but shows "Backend failed to start"

**Solutions:**
1. Check backend executable exists:
   - Windows: `resources/backend/dist/api/api.exe`
   - macOS/Linux: `resources/backend/dist/api/api`

2. Verify Python dependencies are bundled:
   ```bash
   # Re-run PyInstaller with verbose output
   cd backend/desktop
   pyinstaller api.spec --clean --noconfirm --log-level=DEBUG
   ```

3. Check for missing DLLs (Windows):
   - Ensure Visual C++ Redistributable is installed
   - CUDA libraries must be available if using GPU

#### AI Models Not Found

**Symptom:** Inference fails with "Model file not found"

**Solutions:**
1. Verify model files are in `backend/app/AI_models/`
2. Check `electron-builder.config.js` includes models in `extraResources`
3. Update model loading code to use runtime paths:
   ```python
   import sys
   import os
   
   if getattr(sys, 'frozen', False):
       base_path = sys._MEIPASS
   else:
       base_path = os.path.dirname(__file__)
   
   model_path = os.path.join(base_path, 'AI_models', 'model_name')
   ```

#### Electron Window Blank/White Screen

**Symptom:** App launches but shows blank window

**Solutions:**
1. Open DevTools (F12 or Cmd+Option+I) and check console for errors
2. Verify frontend build exists: `frontend/build/index.html`
3. Check Content Security Policy isn't blocking resources
4. Try rebuilding frontend: `npm run build:frontend`

#### Large Installer Size

**Symptom:** Installer is several GB

**Solutions:**
1. This is expected with AI models! PyTorch + models can be 2-5 GB
2. To reduce size:
   - Exclude development dependencies from build
   - Use CPU-only PyTorch if GPU isn't required
   - Consider on-demand model downloading (requires internet)

#### TypeScript Compilation Errors

**Symptom:** `npm run build:electron` fails

**Solutions:**
1. Install TypeScript: `npm install -D typescript`
2. Clear node_modules: `rm -rf node_modules && npm install`
3. Check Node.js version: Must be 18+ for best compatibility

### Getting Help

If you encounter issues not covered here:

1. Check the logs in the app data directory
2. Run in development mode to see detailed error messages
3. Ensure all prerequisites are correctly installed
4. Review GitHub issues for similar problems

---

## Architecture

### Application Structure

```
Echocardiology_App/
├── electron/              # Electron main & preload scripts (TypeScript)
│   ├── main.ts           # Main process (window management, backend lifecycle)
│   ├── preload.ts        # Secure IPC bridge
│   └── ipc.ts            # IPC handlers
├── frontend/             # React application
│   ├── src/              # React components
│   └── build/            # Production build (created by npm run build)
├── backend/              # FastAPI backend
│   ├── app/              # Application code
│   │   ├── AI_models/    # Pre-trained models
│   │   ├── api/          # API routes
│   │   └── main.py       # FastAPI entry point
│   └── desktop/          # Desktop packaging
│       ├── launcher.py   # PyInstaller entry point
│       └── api.spec      # PyInstaller configuration
├── scripts/              # Helper scripts
├── dist/                 # Build output (installers)
└── package.json          # Root dependencies & scripts
```

### Runtime Flow

1. **User launches app** → Electron main process starts
2. **Main process**:
   - Finds available port for backend
   - Spawns PyInstaller-built backend process
   - Waits for backend health check (HTTP GET /api/health)
   - Creates BrowserWindow
3. **BrowserWindow loads**:
   - DEV: http://localhost:3000 (React dev server)
   - PROD: local `frontend/build/index.html`
4. **Frontend communicates**:
   - Gets backend URL via IPC from Electron
   - Makes HTTP requests to `http://127.0.0.1:<port>/api`
5. **Backend processes**:
   - Loads AI models from packaged resources
   - Handles API requests
   - Returns results to frontend

### Security Model

- **Context Isolation**: ✅ Enabled (renderer can't access Node.js directly)
- **Node Integration**: ❌ Disabled in renderer
- **Sandbox**: ✅ Enabled for renderer process
- **IPC**: Minimal, typed, secure channels via preload script
- **CSP**: Recommended to set for local file:// protocol

---

## Next Steps

### For Demonstration
1. Follow [Development Setup](#development-setup)
2. Run `npm run dev` to start in development mode
3. Test all features work correctly

### For Distribution
1. Complete [Building the Application](#building-the-application)
2. Run [Offline Testing](#offline-testing) checklist
3. Create installers with `npm run dist`
4. Test installer on clean machine

### For CI/CD (Optional)
Consider adding GitHub Actions workflow to:
- Build for all platforms automatically
- Create draft releases with installers
- Run automated offline tests

---

## Additional Resources

- **Electron Documentation**: https://www.electronjs.org/docs
- **electron-builder**: https://www.electron.build/
- **PyInstaller**: https://pyinstaller.org/
- **FastAPI**: https://fastapi.tiangolo.com/

---

## Version History

- **v1.0.0** (Initial Release)
  - Electron wrapper for existing web app
  - Cross-platform builds for Windows, macOS, Linux
  - Offline-first architecture with bundled backend

---

**Maintainer**: Horalix Team  
**License**: See LICENSE file  
**Support**: Open an issue on GitHub for questions or problems

---

## Updated Dev & Runtime Behavior

- Dev start (`scripts/dev-start.*`):
  - Does not auto-open a browser tab; Electron opens and connects to the React dev server. To open the web UI manually, run `cd frontend && npm start`.
  - Attempts to start Orthanc via Docker Compose. If Docker is unavailable, startup continues and a warning is logged.
  - To enable Electron DevTools in development, set `ELECTRON_OPEN_DEVTOOLS=1` before launching.

- System tray and background:
  - Closing the window hides the app to the system tray; the app continues running in the background.
  - Use the tray icon menu to reopen the app or to Quit.
  - Window size/position is remembered; next launch restores your previous state.

- Route persistence:
  - The app restores the last visited route on launch (subject to authentication). This makes relaunching feel instant, similar to restoring a minimized app.

- Packaging:
  - Packaged app attempts to start Orthanc using the bundled `docker-compose.yml`. Orthanc is not stopped automatically on quit.
  - The backend console window is hidden by default. To enable it for debugging, change `console=False` to `console=True` in `backend/desktop/api.spec` and rebuild the backend.
