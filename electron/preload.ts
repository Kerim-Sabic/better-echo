import { contextBridge, ipcRenderer } from 'electron';
import type { PersistedClientRuntimeConfig, RuntimeConfig } from './runtime';

export interface ElectronAPI {
  getRuntimeConfig: () => Promise<RuntimeConfig>;
  saveRuntimeConfig: (config: PersistedClientRuntimeConfig) => Promise<RuntimeConfig>;
  getBackendUrl: () => Promise<string>;
  checkBackendHealth: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getAppPaths: () => Promise<{
    userData: string;
    appData: string;
    temp: string;
  }>;
  saveTextFile: (payload: {
    suggestedName?: string;
    contents: string;
    title?: string;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    close: () => Promise<void>;
    onMaximizeChange: (callback: (isMax: boolean) => void) => () => void;
  };
  report: {
    previewPdf: (
      html: string,
      options?: any,
      title?: string
    ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
}

const electronAPI: ElectronAPI = {
  getRuntimeConfig: () => ipcRenderer.invoke('get-runtime-config'),
  saveRuntimeConfig: (config: PersistedClientRuntimeConfig) => ipcRenderer.invoke('save-runtime-config', config),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  checkBackendHealth: () => ipcRenderer.invoke('backend:isHealthy'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  saveTextFile: payload => ipcRenderer.invoke('save-text-file', payload),
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
    previewPdf: (html: string, options?: any, title?: string) =>
      ipcRenderer.invoke('report:printToPdf', { html, options, title }),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
