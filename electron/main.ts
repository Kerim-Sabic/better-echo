import { app, ipcMain, session } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc';
import { attemptStartOrthanc, setupOrthancAuth, stopOrthanc } from './orthanc';
import { startBackend, stopBackend, getBackendPort } from './backend';
import { createMainWindow, createTray, getMainWindow, getTrayIconPath } from './window';
import { startLLM, stopLLM, isLLMRunning } from './llm';

const isDev = process.env.NODE_ENV === 'development';
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

// Feature flag: stop Orthanc Docker container on quit (default true in prod)
const STOP_ORTHANC_ON_QUIT: boolean = (
    (process.env.STOP_ORTHANC_ON_QUIT ?? (isDev ? '0' : '1')) === '1'
);
// Best-effort cleanup; Orthanc may be left running if this flag is off or stop fails.

let isQuitting = false;

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
        if (CLEAR_ELECTRON_WEB_CACHE_ON_START) {
            await clearRendererWebCaches();
        }
        if (!isDev) {
            attemptStartOrthanc().catch((err) => console.warn('Orthanc start warning:', err));
        }
        setupOrthancAuth(ORTHANC_CONFIG);
        const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
        await startBackend({ isDev, devPort: BACKEND_DEV_PORT, resourcesPath });

        // Start LLM if enabled and not already running
        const enableLLM = process.env.ENABLE_LLM === 'true';
        const llmRunning = await isLLMRunning();

        if (enableLLM && !llmRunning) {
            console.log('ENABLE_LLM is true and LLM not running, starting LLM in background...');
            // Don't await - let LLM start in background while window opens
            startLLM({ resourcesPath }).catch((err) => {
                console.warn('LLM start warning:', err);
                // Continue without LLM if startup fails
            });
        } else if (llmRunning) {
            console.log('LLM is already running, skipping startup');
        } else {
            console.log('ENABLE_LLM is not set, skipping LLM startup');
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
    } catch (error) {
        console.error('Failed to start application:', error);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    // Keep running in background (tray) until user quits
    if (isQuitting) {
        stopBackend();
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
    stopBackend();
    stopLLM();
    // Best-effort: stop Orthanc container via docker compose in production
    if (STOP_ORTHANC_ON_QUIT && !isDev) {
        stopOrthanc().catch((e) => console.warn('Failed to stop Orthanc on quit:', e));
    }
});

// Graceful shutdown handler for SIGTERM/SIGINT
// NOTE: Cross-platform behavior differences:
// - Unix/Linux/Mac: These handlers execute on Ctrl+C or kill signals ✅
// - Windows (dev mode with batch/npm/concurrently): Signals don't reach Electron ❌
//   → On Windows dev, the PowerShell script's finally block handles cleanup instead
// - Windows (production): These handlers work correctly ✅
// - System tray quit: Uses 'before-quit' handler (works on all platforms) ✅
function gracefulShutdown(signal: string): void {
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Prevent multiple shutdown attempts
    if (isQuitting) {
        console.log('Shutdown already in progress');
        return;
    }
    isQuitting = true;

    try {
        // Stop services synchronously
        console.log('Stopping backend...');
        stopBackend();

        console.log('Stopping LLM...');
        stopLLM();

        console.log('Shutdown complete');
    } catch (err) {
        console.error('Error during shutdown:', err);
    } finally {
        // Force exit after cleanup (more reliable than app.quit for signal handlers)
        process.exit(0);
    }
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
