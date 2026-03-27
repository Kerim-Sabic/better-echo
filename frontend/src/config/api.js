let backendUrl = null;
let uploadsUrl = null;
let viewerBaseUrl = null;
let runtimeConfigPromise = null;

function normalizeBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
}

async function resolveElectronRuntimeConfig() {
    if (runtimeConfigPromise) {
        return runtimeConfigPromise;
    }

    if (!window.electronAPI) {
        return null;
    }

    if (window.electronAPI.getRuntimeConfig) {
        runtimeConfigPromise = window.electronAPI.getRuntimeConfig();
        return runtimeConfigPromise;
    }

    if (window.electronAPI.getBackendUrl) {
        const backendBaseUrl = await window.electronAPI.getBackendUrl();
        runtimeConfigPromise = Promise.resolve({
            runtimeMode: "server",
            backendBaseUrl,
            viewerBaseUrl: null,
        });
        return runtimeConfigPromise;
    }

    return null;
}

export function resetResolvedApiUrls() {
    backendUrl = null;
    uploadsUrl = null;
    viewerBaseUrl = null;
    runtimeConfigPromise = null;
}

export const getBackendUrl = async () => {
    if (backendUrl) {
        return backendUrl;
    }

    if (window.electronAPI) {
        try {
            const runtimeConfig = await resolveElectronRuntimeConfig();
            const baseUrl = normalizeBaseUrl(runtimeConfig?.backendBaseUrl);

            if (baseUrl) {
                backendUrl = `${baseUrl}/api`;
                uploadsUrl = `${baseUrl}/uploads`;
                console.log('Using Electron backend URL:', backendUrl);
                console.log('Using Electron uploads URL:', uploadsUrl);
                return backendUrl;
            }

            if (runtimeConfig?.runtimeMode === "client") {
                throw new Error("Client runtime server base URL is not configured");
            }

            if (window.electronAPI.getBackendUrl) {
                const legacyBaseUrl = normalizeBaseUrl(await window.electronAPI.getBackendUrl());
                backendUrl = `${legacyBaseUrl}/api`;
                uploadsUrl = `${legacyBaseUrl}/uploads`;
                console.log('Using Electron backend URL:', backendUrl);
                console.log('Using Electron uploads URL:', uploadsUrl);
                return backendUrl;
            }
        } catch (error) {
            if (window.electronAPI.getRuntimeConfig) {
                throw error;
            }

            console.warn('Failed to get Electron backend URL, using environment variable:', error);
        }
    }

    const envBaseUrl = normalizeBaseUrl(process.env.REACT_APP_API_URL);
    const envUploadsUrl = normalizeBaseUrl(process.env.REACT_APP_API_URL_UPLOADS);

    if (envBaseUrl) {
        backendUrl = envBaseUrl;
        uploadsUrl = envUploadsUrl || `${envBaseUrl.replace(/\/api$/i, "")}/uploads`;
        console.log('Using environment backend URL:', backendUrl);
        console.log('Using environment uploads URL:', uploadsUrl);
        return backendUrl;
    }

    backendUrl = 'http://localhost:8000/api';
    uploadsUrl = 'http://localhost:8000/uploads';
    console.log('Using environment backend URL:', backendUrl);
    console.log('Using environment uploads URL:', uploadsUrl);
    return backendUrl;
};

export const getViewerBaseUrl = async () => {
    if (viewerBaseUrl !== null) {
        return viewerBaseUrl;
    }

    if (window.electronAPI) {
        const runtimeConfig = await resolveElectronRuntimeConfig();
        const runtimeViewerBaseUrl = normalizeBaseUrl(runtimeConfig?.viewerBaseUrl);
        if (runtimeViewerBaseUrl) {
            viewerBaseUrl = runtimeViewerBaseUrl;
            return viewerBaseUrl;
        }
    }

    viewerBaseUrl = normalizeBaseUrl(process.env.REACT_APP_OHIF_BASE_URL);
    return viewerBaseUrl;
};
