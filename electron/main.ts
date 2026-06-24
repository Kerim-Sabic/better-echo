import { app, dialog, ipcMain, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { loadBackendEnvIntoProcessEnv } from './env';
import { registerIpcHandlers } from './ipc';
import { setupOrthancAuth } from './orthanc';
import { startBackend, stopBackend, getBackendPort } from './backend';
import { createMainWindow, createTray, getMainWindow, getTrayIconPath } from './window';
import { startLLM, stopLLM, isLLMRunning } from './llm';
import { getRuntimeMode } from './runtime';
import { startManagedInfrastructure, stopManagedInfrastructure } from './infrastructure';
import { runServerPreflight } from './preflight';
import { startStaticServer, stopStaticServer } from './staticServer';
import { installStartupLogging } from './startupLogger';

installStartupLogging();
loadBackendEnvIntoProcessEnv();

const isDev = process.env.NODE_ENV === 'development';
const runtimeMode = getRuntimeMode();
const managesLocalServices = runtimeMode === 'server';
const REACT_DEV_PORT = 3000;
const BACKEND_DEV_PORT = 8000;
// Toggle to default-open DevTools in development. Flip to true locally if desired.
const OPEN_DEVTOOLS_DEFAULT = true;
// Clear renderer web caches on startup to avoid stale iframe/service worker content.
const CLEAR_ELECTRON_WEB_CACHE_ON_START: boolean = (
    (process.env.CLEAR_ELECTRON_WEB_CACHE_ON_START ?? '1') === '1'
);
// Allow autoplay with audio for splash video first pass
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ORTHANC_CONFIG = {
    url: process.env.ORTHANC_URL || 'http://localhost:8042',
    user: process.env.ORTHANC_USER || 'orthanc',
    pass: process.env.ORTHANC_PASS || 'orthanc',
};

// Feature flag: stop packaged-server Docker services on quit (default true in prod)
const STOP_LOCAL_INFRA_ON_QUIT: boolean = (
    (process.env.STOP_LOCAL_INFRA_ON_QUIT ?? (isDev ? '0' : '1')) === '1'
);
// Best-effort cleanup; local Docker services may be left running if this flag is off or stop fails.

let isQuitting = false;

// Loopback http origin the packaged CLIENT renderer is served from (set during
// app 'ready'). Undefined in dev (loads the CRA dev server) and in server mode
// (keeps file://). See staticServer.ts for why this exists.
let packagedClientUrl: string | undefined;

// Locate the packaged React build directory (mirror of window.ts's index.html
// candidate search, but returns the directory the static server should serve).
function resolvePackagedBuildDir(): string | null {
    const candidates = [
        path.join(__dirname, '..', '..', 'frontend', 'build'),
        path.join(__dirname, '..', 'frontend', 'build'),
    ];
    return candidates.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || null;
}

function parseBooleanEnvFlag(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
    }

    return fallback;
}

const ENABLE_LLM = parseBooleanEnvFlag(process.env.ENABLE_LLM, true);

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    }
});

const trayIconPath = getTrayIconPath(isDev);

function ensureMainWindow(): void {
    const win = getMainWindow() || createMainWindow({
        isDev,
        reactDevPort: REACT_DEV_PORT,
        openDevtools: OPEN_DEVTOOLS_DEFAULT,
        iconPath: trayIconPath,
        isQuitting: () => isQuitting,
        packagedClientUrl,
    });
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

async function clearRendererWebCaches(): Promise<void> {
    try {
        const ses = session.defaultSession;
        await ses.clearCache();
        await ses.clearStorageData({
            storages: ['serviceworkers', 'cachestorage'],
        });
        console.log('Cleared Electron renderer web cache/storage on startup.');
    } catch (err) {
        console.warn('Failed to clear Electron renderer web cache/storage:', err);
    }
}

app.on('ready', async () => {
  try {
    console.log(`Electron runtime mode: ${runtimeMode}`);
    console.log(`Electron resources path: ${process.resourcesPath || '<unset>'}`);

    // In client mode the renderer connects to a remote backend. Chromium
    // enforces CORS on cross-origin requests (origin is http://localhost:3000
    // in dev, null/file:// in production).
    //
    // Fix: capture each request's Origin in onBeforeSendHeaders (where request
    // headers are always available) keyed by request ID, then inject
    // Access-Control-Allow-Origin in onHeadersReceived before Chromium does its
    // CORS check. Safe here because we're inside a sandboxed Electron renderer.
    if (runtimeMode === 'client') {
      const pendingOrigins = new Map<number, string>();

      session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const origin = details.requestHeaders['Origin'] || details.requestHeaders['origin'];
        if (origin) {
          pendingOrigins.set(details.id, origin);
        }
        callback({ requestHeaders: details.requestHeaders });
      });

      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const origin = pendingOrigins.get(details.id);
        pendingOrigins.delete(details.id);
        const responseHeaders = { ...(details.responseHeaders as Record<string, string[]>) };
        if (origin) {
          responseHeaders['access-control-allow-origin'] = [origin];
          responseHeaders['access-control-allow-credentials'] = ['true'];
          responseHeaders['access-control-allow-headers'] = ['Content-Type, Authorization, X-Horalix-Desktop-Client'];
          responseHeaders['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS, PATCH'];
          // FastAPI's CORSMiddleware returns 400 for OPTIONS preflights from
          // origins not in its allowlist. The browser rejects preflights with
          // non-2xx status regardless of headers, so fix the status line too.
          if (details.method === 'OPTIONS' && details.statusCode >= 400) {
            callback({ responseHeaders, statusLine: 'HTTP/1.1 200 OK' });
            return;
          }
        }
        callback({ responseHeaders });
      });
    }

    // Packaged client: serve the renderer over a loopback http origin instead
    // of file:// so it has a real, non-null origin (required by the CORS
    // interceptor above and by the OHIF AI-panel postMessage bridge). Dev uses
    // the CRA dev server; server mode keeps file:// unchanged.
    if (runtimeMode === 'client' && !isDev) {
      const buildDir = resolvePackagedBuildDir();
      if (buildDir) {
        try {
          packagedClientUrl = await startStaticServer(buildDir);
          console.log('Client renderer served at', packagedClientUrl);
        } catch (err) {
          console.error('Static server failed to start; falling back to file://', err);
        }
      } else {
        console.warn('Packaged frontend build not found; falling back to file://');
      }
    }

    if (CLEAR_ELECTRON_WEB_CACHE_ON_START) {
      await clearRendererWebCaches();
    }

    const resourcesPath = process.resourcesPath || path.join(__dirname, '..');

    if (managesLocalServices && !isDev) {
      await runServerPreflight({ isDev, resourcesPath });
      await startManagedInfrastructure({
        postgresPort: parseInt(process.env.POSTGRES_PORT || '5433', 10),
        orthancUrl: ORTHANC_CONFIG.url,
        viewerUrl: process.env.VIEWER_PUBLIC_BASE_URL || 'http://localhost:3001',
      });
    }
    if (managesLocalServices) {
      setupOrthancAuth(ORTHANC_CONFIG);
    }

    if (managesLocalServices) {
      await startBackend({ isDev, devPort: BACKEND_DEV_PORT, resourcesPath });
    } else {
      console.log('Client runtime mode: skipping local backend startup');
    }

    if (managesLocalServices) {
      const llmRunning = await isLLMRunning();

      if (ENABLE_LLM && !llmRunning) {
        console.log('ENABLE_LLM is true and LLM not running, starting LLM in background...');
        startLLM({ resourcesPath }).catch((err) => {
          console.warn('LLM start warning:', err);
        });
      } else if (llmRunning) {
        console.log('LLM is already running, skipping startup');
      } else {
        console.log('ENABLE_LLM is not set, skipping LLM startup');
      }
    } else {
      console.log('Client runtime mode: skipping local LLM startup');
    }

    registerIpcHandlers(ipcMain, () => getBackendPort());
        createTray({
            iconPath: trayIconPath,
            onOpen: () => ensureMainWindow(),
            onQuit: () => {
                isQuitting = true;
                app.quit();
            },
        });
        ensureMainWindow();
        console.log('Application startup complete.');
    } catch (error) {
        console.error('Failed to start application:', error);
        dialog.showErrorBox(
            'Horalix Pulse Server failed to start',
            error instanceof Error ? error.message : String(error)
        );
        app.quit();
    }
});

app.on('window-all-closed', () => {
  // Keep running in background (tray) until user quits
  if (isQuitting) {
    if (managesLocalServices) {
      stopBackend();
    }
    app.quit();
  }
});

app.on('activate', () => {
    if (!getMainWindow()) {
        ensureMainWindow();
    }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopStaticServer();
  if (managesLocalServices) {
    stopBackend();
    if (ENABLE_LLM) {
      stopLLM();
    }
  }
  if (managesLocalServices && STOP_LOCAL_INFRA_ON_QUIT && !isDev) {
    stopManagedInfrastructure().catch((e) => console.warn('Failed to stop managed infrastructure on quit:', e));
  }
});

// Graceful shutdown handler for SIGTERM/SIGINT
// NOTE: Cross-platform behavior differences:
// - Unix/Linux/Mac: These handlers execute on Ctrl+C or kill signals ✅
// - Windows (dev mode with batch/npm/concurrently): Signals don't reach Electron ❌
//   → On Windows dev, the PowerShell script's finally block handles cleanup instead
// - Windows (production): These handlers work correctly ✅
// - System tray quit: Uses 'before-quit' handler (works on all platforms) ✅
async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Prevent multiple shutdown attempts
    if (isQuitting) {
        console.log('Shutdown already in progress');
        return;
    }
    isQuitting = true;

  try {
    if (managesLocalServices) {
      console.log('Stopping backend...');
      stopBackend();

      if (ENABLE_LLM) {
        console.log('Stopping LLM...');
        stopLLM();
      }

      if (STOP_LOCAL_INFRA_ON_QUIT && !isDev) {
        console.log('Stopping local infrastructure...');
        await stopManagedInfrastructure();
      }
    }

    console.log('Shutdown complete');
  } catch (err) {
        console.error('Error during shutdown:', err);
    } finally {
        // Force exit after cleanup (more reliable than app.quit for signal handlers)
        process.exit(0);
    }
}

// Handle termination signals
process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

// ----------------- Window control IPC -----------------
ipcMain.handle('window:minimize', () => {
    const win = getMainWindow();
    if (win) win.minimize();
});
ipcMain.handle('window:toggleMaximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.handle('window:isMaximized', () => {
    const win = getMainWindow();
    return win ? win.isMaximized() : false;
});
ipcMain.handle('window:close', () => {
    const win = getMainWindow();
    if (win) win.close();
});
