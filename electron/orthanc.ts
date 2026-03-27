import { app, session } from 'electron';

export type OrthancAuthConfig = {
    url: string;
    user: string;
    pass: string;
};

export function setupOrthancAuth(config: OrthancAuthConfig): void {
    try {
        const orthancUrl = new URL(config.url);
        const orthancOrigin = orthancUrl.origin;
        const orthancHost = orthancUrl.hostname;
        const orthancPort = orthancUrl.port
            ? parseInt(orthancUrl.port, 10)
            : (orthancUrl.protocol === 'https:' ? 443 : 80);
        const basicAuth = 'Basic ' + Buffer.from(`${config.user}:${config.pass}`).toString('base64');

        session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [orthancOrigin + '/*'] }, (details, callback) => {
            const headers = details.requestHeaders;
            headers['Authorization'] = basicAuth;
            callback({ requestHeaders: headers });
        });

        app.on('login', (event, _webContents, _request, authInfo, callback) => {
            if (!authInfo.isProxy && authInfo.host === orthancHost && authInfo.port === orthancPort) {
                event.preventDefault();
                callback(config.user, config.pass);
            }
        });
    } catch (e) {
        console.warn('Failed to set up Orthanc auth interceptors:', e);
    }
}
