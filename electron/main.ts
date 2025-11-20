import { app, ipcMain } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc';
import { attemptStartOrthanc, setupOrthancAuth, stopOrthanc } from './orthanc';
import { startBackend, stopBackend, getBackendPort } from './backend';
import { createMainWindow, createTray, getMainWindow, getTrayIconPath } from './window';

const isDev = process.env.NODE_ENV === 'development';
const REACT_DEV_PORT = 3000;
const BACKEND_DEV_PORT = 8000;
// Toggle to default-open DevTools in development. Flip to true locally if desired.
const OPEN_DEVTOOLS_DEFAULT = false;
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

app.on('ready', async () => {
    try {
        if (!isDev) {
            attemptStartOrthanc().catch((err) => console.warn('Orthanc start warning:', err));
        }
        setupOrthancAuth(ORTHANC_CONFIG);
        const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
        await startBackend({ isDev, devPort: BACKEND_DEV_PORT, resourcesPath });
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
    // Best-effort: stop Orthanc container via docker compose in production
    if (STOP_ORTHANC_ON_QUIT && !isDev) {
        stopOrthanc().catch((e) => console.warn('Failed to stop Orthanc on quit:', e));
    }
});

process.on('SIGTERM', () => {
    stopBackend();
    app.quit();
});

process.on('SIGINT', () => {
    stopBackend();
    app.quit();
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
