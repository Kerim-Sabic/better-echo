import { createContext, useContext, useEffect, useState } from "react";

const RuntimeConfigContext = createContext(null);

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
        const nextRuntimeConfig = await window.electronAPI.getRuntimeConfig();
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
    runtimeConfig,
    loading,
    isClientRuntimeConfigEditorOpen: false,
    openClientRuntimeConfigEditor: () => {},
    closeClientRuntimeConfigEditor: () => {},
  };
}
