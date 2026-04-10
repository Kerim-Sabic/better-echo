# Electron Architecture

Last Updated: 2026-04-04  
Owner: Desktop

## Scope

Desktop lifecycle, runtime-mode selection, packaged startup, IPC bridge, and window/tray behavior.

## Electron Tree

```text
electron/
|- main.ts
|- backend.ts
|- env.ts
|- infrastructure.ts
|- ipc.ts
|- llm.ts
|- orthanc.ts
|- preflight.ts
|- preload.ts
|- runtime.ts
|- window.ts
|- electron-builder.client.config.js
|- electron-builder.server.config.js
`- electron-builder.shared.config.js
```

## Runtime Modes

Runtime mode is resolved in [`runtime.ts`](../../electron/runtime.ts):

1. `server`
   - starts managed Docker infrastructure
   - starts the packaged backend locally
   - can start the local LLM runtime
   - exposes local backend and viewer URLs to the renderer
2. `client`
   - does not start Docker, backend, or LLM
   - reads and persists remote server/viewer base URLs through the runtime-config bridge

Packaged products set `horalixRuntimeMode` in:

1. [`electron-builder.client.config.js`](../../electron/electron-builder.client.config.js)
2. [`electron-builder.server.config.js`](../../electron/electron-builder.server.config.js)

## Startup Sequence

Startup is coordinated in [`main.ts`](../../electron/main.ts):

1. Load backend `.env` values into the Electron process with [`env.ts`](../../electron/env.ts).
2. Resolve runtime mode.
3. Clear renderer cache and service-worker storage on startup.
4. In packaged server mode:
   - run preflight through [`preflight.ts`](../../electron/preflight.ts)
   - start PostgreSQL, Orthanc, and OHIF through [`infrastructure.ts`](../../electron/infrastructure.ts)
   - install Orthanc auth interception through [`orthanc.ts`](../../electron/orthanc.ts)
   - launch the packaged backend through [`backend.ts`](../../electron/backend.ts)
   - optionally launch the local LLM runtime through [`llm.ts`](../../electron/llm.ts)
5. Register IPC handlers from [`ipc.ts`](../../electron/ipc.ts).
6. Create the tray and main window through [`window.ts`](../../electron/window.ts).

## Backend and Infrastructure Orchestration

Server mode orchestration is split by responsibility:

1. [`backend.ts`](../../electron/backend.ts)
   - resolves packaged backend host and port
   - launches the compiled backend executable
   - waits for `/api/health`
2. [`infrastructure.ts`](../../electron/infrastructure.ts)
   - resolves the packaged `docker-compose.yml`
   - checks Docker availability
   - rebuilds the packaged viewer image when packaged viewer assets changed
   - starts PostgreSQL, Orthanc, and OHIF
3. [`preflight.ts`](../../electron/preflight.ts)
   - runs the packaged PowerShell preflight script before startup
4. [`llm.ts`](../../electron/llm.ts)
   - starts and stops the optional local LLM process

## Renderer Bridge

The preload layer in [`preload.ts`](../../electron/preload.ts) exposes a narrow API:

1. `getRuntimeConfig()`
2. `saveRuntimeConfig(...)`
3. `checkBackendHealth()`
4. `getAppVersion()`
5. `getAppPaths()`
6. `saveTextFile(...)`
7. `report.previewPdf(...)`
8. window control helpers

IPC handlers are implemented in [`ipc.ts`](../../electron/ipc.ts). Client runtime configuration is stored as `runtime-config.json` under the Electron `userData` directory.

## Window and Tray Behavior

Window and tray behavior lives in [`window.ts`](../../electron/window.ts):

1. the main window is reused whenever possible
2. tray keeps the app resident until explicit quit
3. maximize/minimize/close actions are bridged through preload IPC
4. runtime display names and tray assets differ by client vs server packaging

## Development vs Packaged Runtime

Development:

1. Electron loads the React dev server.
2. Backend is expected to be started by npm scripts instead of by Electron.
3. Runtime mode still controls whether the renderer behaves like client or server.

Packaged server:

1. Loads the packaged frontend build from `file://`.
2. Starts the packaged backend binary and managed Docker services locally.
3. Uses packaged resources from `dist/server/win-unpacked/resources`.

Packaged client:

1. Loads the packaged frontend build from `file://`.
2. Persists the remote server/viewer address through runtime config.
3. Does not carry backend or Docker-managed server resources.

## Packaging Split

Shared builder behavior lives in [`electron-builder.shared.config.js`](../../electron/electron-builder.shared.config.js).

Client packaging in [`electron-builder.client.config.js`](../../electron/electron-builder.client.config.js):

1. outputs to `dist/client`
2. brands the app as `Horalix Pulse`
3. includes the client tray asset only

Server packaging in [`electron-builder.server.config.js`](../../electron/electron-builder.server.config.js):

1. outputs to `dist/server`
2. brands the app as `Horalix Pulse Server`
3. bundles backend `dist`, generated runtime env, runtime assets, viewer runtime config, viewer source bundle, Orthanc resources, and packaged ops scripts

## Operational Boundaries

1. Electron main owns process lifecycle and local-service startup decisions.
2. Preload owns the only renderer-to-main bridge.
3. Renderer state uses runtime config and API base URLs; it does not start local services directly.
4. Packaged server startup fails fast when preflight fails.
