import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getRuntimeMode } from './runtime';

export type WindowState = {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
};

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 800;

let windowStatePath: string;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getAppDisplayName(): string {
    return getRuntimeMode() === 'client' ? 'Horalix Pulse' : 'Horalix Pulse Server';
}

function getWindowStatePath(): string {
    const userData = app.getPath('userData');
    // Persist per-user window geometry alongside Electron userData
    return path.join(userData, 'window-state.json');
}

function loadWindowState(): WindowState {
    try {
        const filePath = getWindowStatePath();
        windowStatePath = filePath;
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as WindowState;
            return {
                width: Math.max(800, data.width || 1400),
                height: Math.max(600, data.height || 900),
                x: data.x,
                y: data.y,
                isMaximized: data.isMaximized || false,
            };
        }
    } catch (e) {
        console.warn('Failed to load window state:', e);
    }
    try {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        return {
            width: Math.max(1280, Math.floor(width * 0.85)),
            height: Math.max(800, Math.floor(height * 0.85)),
        };
    } catch {
        return { width: 1400, height: 900 };
    }
}

export function saveWindowState(win: BrowserWindow | null): void {
    if (!win) return;
    const bounds = win.getBounds();
    const state: WindowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: win.isMaximized(),
    };
    try {
        const filePath = windowStatePath || getWindowStatePath();
        fs.writeFileSync(filePath, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save window state:', e);
    }
}

export function getTrayIconPath(isDev: boolean): string {
    if (isDev) {
        return path.join(__dirname, '..', '..', 'frontend', 'public', 'horalix-tray-icon-256.png');
    }
    // Packaged tray icon lives under resources/assets/tray.png
    return path.join(process.resourcesPath || path.join(__dirname, '..'), 'assets', 'tray.png');
}

export function createTray(options: { iconPath: string; onOpen: () => void; onQuit: () => void }): Tray | null {
    const image = nativeImage.createFromPath(options.iconPath);
    tray = new Tray(image);
    const appDisplayName = getAppDisplayName();
    tray.setToolTip(appDisplayName);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Open ${appDisplayName}`,
            click: () => options.onOpen(),
        },
        {
            label: 'Quit',
            click: () => options.onQuit(),
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => options.onOpen());
    return tray;
}

export function createMainWindow(options: {
    isDev: boolean;
    reactDevPort: number;
    openDevtools: boolean;
    iconPath: string;
    isQuitting: () => boolean;
    // When set (packaged client mode), load the renderer from this loopback
    // http origin instead of file://, so it has a real, non-null origin.
    packagedClientUrl?: string;
}): BrowserWindow {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
        width: Math.max(MIN_WIDTH, state.width),
        height: Math.max(MIN_HEIGHT, state.height),
        x: state.x,
        y: state.y,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        center: state.x === undefined && state.y === undefined,
        autoHideMenuBar: true,
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        backgroundColor: '#ffffff',
        icon: options.iconPath,
        title: getAppDisplayName(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        show: false,
    });

    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        if (state.isMaximized) {
            mainWindow?.maximize();
        }
        mainWindow?.show();
    });

    if (options.isDev) {
        mainWindow.loadURL(`http://localhost:${options.reactDevPort}`);
        if (process.env.ELECTRON_OPEN_DEVTOOLS === '1' || options.openDevtools) {
            mainWindow.webContents.openDevTools();
        }
    } else if (options.packagedClientUrl) {
        // Packaged client served over a loopback http origin (see staticServer.ts)
        // so the renderer has a real, non-null origin for CORS + the OHIF bridge.
        console.log('Loading packaged renderer from loopback origin:', options.packagedClientUrl);
        void mainWindow.loadURL(options.packagedClientUrl).catch(error => {
            console.error('Failed to load packaged renderer over loopback:', error);
        });
    } else {
        const packagedIndexCandidates = [
            path.join(__dirname, '..', '..', 'frontend', 'build', 'index.html'),
            path.join(__dirname, '..', 'frontend', 'build', 'index.html'),
        ];
        const indexPath =
            packagedIndexCandidates.find(candidatePath => fs.existsSync(candidatePath)) ||
            packagedIndexCandidates[0];

        console.log('Loading packaged renderer from:', indexPath);
        void mainWindow.loadFile(indexPath).catch(error => {
            console.error('Failed to load packaged renderer:', error);
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });

    mainWindow.on('close', (e) => {
        if (!options.isQuitting()) {
            e.preventDefault();
            saveWindowState(mainWindow);
            mainWindow?.hide();
        } else {
            saveWindowState(mainWindow);
        }
    });

    mainWindow.on('resize', () => saveWindowState(mainWindow));
    mainWindow.on('move', () => saveWindowState(mainWindow));

    mainWindow.on('maximize', () => {
        try { mainWindow?.webContents.send('window:isMaximized-changed', true); } catch {}
    });
    mainWindow.on('unmaximize', () => {
        try { mainWindow?.webContents.send('window:isMaximized-changed', false); } catch {}
    });

    return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}
