import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getBackendUrl: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  getAppPaths: () => Promise<{
    userData: string;
    appData: string;
    temp: string;
  }>;
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    close: () => Promise<void>;
    onMaximizeChange: (callback: (isMax: boolean) => void) => () => void;
  };
  report: {
    previewPdf: (html: string, options?: any) => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
}

const electronAPI: ElectronAPI = {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close'),
    onMaximizeChange: (callback: (isMax: boolean) => void) => {
      const channel = 'window:isMaximized-changed';
      const listener = (_event: unknown, value: boolean) => callback(value);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  report: {
    previewPdf: (html: string, options?: any) => ipcRenderer.invoke('report:printToPdf', { html, options }),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
