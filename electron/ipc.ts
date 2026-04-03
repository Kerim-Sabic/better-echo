import { IpcMain, app, BrowserWindow, dialog, shell } from 'electron';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import {
  normalizeBaseUrl,
  PersistedClientRuntimeConfig,
  resolveBackendHealthUrl,
  resolveRuntimeConfig,
} from './runtime';

const RUNTIME_CONFIG_FILE = 'runtime-config.json';

function getRuntimeConfigPath(): string {
  return path.join(app.getPath('userData'), RUNTIME_CONFIG_FILE);
}

function readPersistedClientRuntimeConfig(): PersistedClientRuntimeConfig {
  try {
    const filePath = getRuntimeConfigPath();
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const rawValue = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(rawValue) as PersistedClientRuntimeConfig;

    return {
      serverBaseUrl: normalizeBaseUrl(parsed?.serverBaseUrl),
      viewerBaseUrl: normalizeBaseUrl(parsed?.viewerBaseUrl),
    };
  } catch {
    return {};
  }
}

async function writePersistedClientRuntimeConfig(
  payload: PersistedClientRuntimeConfig
): Promise<PersistedClientRuntimeConfig> {
  const nextConfig: PersistedClientRuntimeConfig = {
    serverBaseUrl: normalizeBaseUrl(payload?.serverBaseUrl),
    viewerBaseUrl: normalizeBaseUrl(payload?.viewerBaseUrl),
  };

  const filePath = getRuntimeConfigPath();
  await fs.promises.writeFile(filePath, JSON.stringify(nextConfig, null, 2));
  return nextConfig;
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getBackendPort: () => number | null
): void {
  ipcMain.handle('get-runtime-config', () => {
    return resolveRuntimeConfig(getBackendPort(), process.env, readPersistedClientRuntimeConfig());
  });

  ipcMain.handle('save-runtime-config', async (_event, payload: PersistedClientRuntimeConfig) => {
    const persistedConfig = await writePersistedClientRuntimeConfig(payload || {});
    return resolveRuntimeConfig(getBackendPort(), process.env, persistedConfig);
  });

  ipcMain.handle('get-backend-url', () => {
    const runtimeConfig = resolveRuntimeConfig(
      getBackendPort(),
      process.env,
      readPersistedClientRuntimeConfig()
    );
    if (!runtimeConfig.backendBaseUrl) {
      throw new Error(`Backend base URL is not configured for ${runtimeConfig.runtimeMode} mode`);
    }

    return runtimeConfig.backendBaseUrl;
  });

  ipcMain.handle('backend:isHealthy', async () => {
    const healthUrl = resolveBackendHealthUrl(
      getBackendPort(),
      process.env,
      readPersistedClientRuntimeConfig()
    );
    if (!healthUrl) {
      return false;
    }

    try {
      const response = await axios.get(healthUrl, { timeout: 1000 });
      return response.status === 200;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-paths', () => {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      temp: app.getPath('temp'),
    };
  });

  ipcMain.handle(
    'save-text-file',
    async (
      _event,
      payload: { suggestedName?: string; contents: string; title?: string }
    ) => {
      const suggestedName = payload?.suggestedName || 'export.json';
      const contents = String(payload?.contents || '');
      const title = payload?.title || 'Save File';

      const { canceled, filePath } = await dialog.showSaveDialog({
        title,
        defaultPath: path.join(app.getPath('documents'), suggestedName),
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      await fs.promises.writeFile(filePath, contents, 'utf-8');
      return { canceled: false, filePath };
    }
  );

  // Generate PDF from provided HTML and open a preview window using Chromium PDF viewer
  ipcMain.handle('report:printToPdf', async (_event, payload: { html: string; options?: any; title?: string; openExternal?: boolean }) => {
    const html: string = payload?.html || '<html><body><p>Empty</p></body></html>';
    const options = payload?.options || { printBackground: true, pageSize: 'A4', landscape: false };
    const title = payload?.title || 'AI Measurements Report';
    const openExternal = Boolean(payload?.openExternal);

    let hiddenWin: BrowserWindow | null = null;
    try {
      hiddenWin = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
        },
        backgroundColor: '#ffffff',
      });

      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      await hiddenWin.loadURL(dataUrl);

      try {
        // best effort wait for fonts
        await hiddenWin.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()');
      } catch {}

      const pdfBuffer = await hiddenWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
        ...options,
      });

      const tmpDir = app.getPath('temp');
      const fileName = `ai_measurements_${Date.now()}.pdf`;
      const pdfPath = path.join(tmpDir, fileName);
      await fs.promises.writeFile(pdfPath, pdfBuffer);

      // Open with Chromium PDF viewer in a new window or external default app
      if (openExternal) {
        await shell.openPath(pdfPath);
      } else {
        const previewWin = new BrowserWindow({
          width: 1000,
          height: 800,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
          },
        });
        previewWin.setTitle(title);
        const fileUrl = pathToFileURL(pdfPath).href;
        await previewWin.loadURL(fileUrl);
      }

      return { ok: true, path: pdfPath };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    } finally {
      try { hiddenWin?.destroy(); } catch {}
    }
  });
}
