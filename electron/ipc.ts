import { IpcMain, app } from 'electron';

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
}
