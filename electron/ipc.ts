import { IpcMain, app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getBackendPort: () => number
): void {
  ipcMain.handle('get-backend-url', () => {
    const port = getBackendPort();
    return `http://127.0.0.1:${port}`;
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
