import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Serve the packaged React build over a real loopback HTTP origin
// (http://127.0.0.1:<port>) instead of file:// (whose origin is "null").
//
// A real, non-null origin is required for the cloud client to work:
//   - The Electron CORS interceptor (main.ts) mirrors the renderer's Origin
//     back as Access-Control-Allow-Origin. Browsers reject ACAO: "null" for
//     credentialed requests, so a file:// renderer can't talk to the backend.
//   - The OHIF AI-panel postMessage bridge rejects a "null" parent origin, so
//     measurements never reach the panel from a file:// renderer.
// With a loopback http origin both work with NO change to the backend or the
// vendored viewer.
//
// Binds to 127.0.0.1 only (never exposed off-machine). Prefers a fixed port so
// the origin — and therefore localStorage / saved session — stays stable across
// launches; falls back to an ephemeral port if the fixed one is taken.

const DEFAULT_PORT = 17645;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

let server: http.Server | null = null;

function makeHandler(resolvedRoot: string, indexPath: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.normalize(path.join(resolvedRoot, rawPath));

      // Block path traversal outside the build root.
      if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const isFile = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      if (!isFile) {
        // SPA fallback: a route without a file extension serves index.html so
        // React Router handles it client-side. A missing asset (has an
        // extension) returns 404 instead of silently serving HTML.
        if (path.extname(rawPath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        filePath = indexPath;
      }

      const ext = path.extname(filePath).toLowerCase();
      const body = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end('Internal server error');
    }
  };
}

export function startStaticServer(
  rootDir: string,
  preferredPort: number = DEFAULT_PORT
): Promise<string> {
  return new Promise((resolve, reject) => {
    const resolvedRoot = path.resolve(rootDir);
    const indexPath = path.join(resolvedRoot, 'index.html');

    const srv = http.createServer(makeHandler(resolvedRoot, indexPath));
    let triedEphemeral = false;

    srv.on('listening', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        server = srv;
        resolve(`http://127.0.0.1:${address.port}`);
      } else {
        reject(new Error('static server: could not resolve listen address'));
      }
    });

    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !triedEphemeral) {
        // Fixed port taken — retry with an OS-assigned ephemeral port.
        triedEphemeral = true;
        srv.listen(0, '127.0.0.1');
      } else {
        reject(err);
      }
    });

    srv.listen(preferredPort, '127.0.0.1');
  });
}

export function stopStaticServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
