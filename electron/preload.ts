import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getBackendUrl: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  getAppPaths: () => Promise<{
    userData: string;
    appData: string;
    temp: string;
  }>;
}

const electronAPI: ElectronAPI = {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
