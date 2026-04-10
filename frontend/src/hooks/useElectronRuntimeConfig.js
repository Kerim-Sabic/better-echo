import { createContext, useContext, useEffect, useState } from "react";

const RuntimeConfigContext = createContext(null);
const NOOP = () => {};

export const EMPTY_ELECTRON_RUNTIME_CONFIG = {
  runtimeConfig: null,
  loading: false,
  isClientRuntimeConfigEditorOpen: false,
  openClientRuntimeConfigEditor: NOOP,
  closeClientRuntimeConfigEditor: NOOP,
};

export async function loadElectronRuntimeConfig() {
  if (!window.electronAPI?.getRuntimeConfig) {
    return null;
  }

  return window.electronAPI.getRuntimeConfig();
}

export function ElectronRuntimeConfigProvider({ value, children }) {
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useElectronRuntimeConfig() {
  const contextValue = useContext(RuntimeConfigContext);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [loading, setLoading] = useState(Boolean(window.electronAPI?.getRuntimeConfig));

  useEffect(() => {
    if (contextValue) {
      return undefined;
    }

    let active = true;

    async function loadRuntimeConfig() {
      if (!window.electronAPI?.getRuntimeConfig) {
        setLoading(false);
        return;
      }

      try {
        const nextRuntimeConfig = await loadElectronRuntimeConfig();
        if (active) {
          setRuntimeConfig(nextRuntimeConfig);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRuntimeConfig();

    return () => {
      active = false;
    };
  }, [contextValue]);

  if (contextValue) {
    return contextValue;
  }

  return {
    ...EMPTY_ELECTRON_RUNTIME_CONFIG,
    runtimeConfig,
    loading,
  };
}
