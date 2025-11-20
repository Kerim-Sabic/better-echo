let backendUrl = null;
let uploadsUrl = null;

export const getBackendUrl = async () => {
    if (backendUrl) {
        return backendUrl;
    }

    if (window.electronAPI && window.electronAPI.getBackendUrl) {
        try {
            const baseUrl = await window.electronAPI.getBackendUrl();
            backendUrl = `${baseUrl}/api`;
            uploadsUrl = `${baseUrl}/uploads`;
            console.log('Using Electron backend URL:', backendUrl);
            console.log('Using Electron uploads URL:', uploadsUrl);
            return backendUrl;
        } catch (error) {
            console.warn('Failed to get Electron backend URL, using environment variable:', error);
        }
    }

    backendUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
    uploadsUrl = process.env.REACT_APP_API_URL_UPLOADS || 'http://localhost:8000/uploads';
    console.log('Using environment backend URL:', backendUrl);
    console.log('Using environment uploads URL:', uploadsUrl);
    return backendUrl;
};

export const getUploadsUrl = async () => {
    if (uploadsUrl) {
        return uploadsUrl;
    }
    await getBackendUrl();
    return uploadsUrl;
};

export const API_CONFIG = {
    get: async () => {
        const url = await getBackendUrl();
        return { API_URL: url };
    }
};
