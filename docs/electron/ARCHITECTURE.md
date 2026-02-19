# Electron Architecture

Last Updated: 2026-02-16  
Owner: Desktop

## Scope

Desktop lifecycle, backend process orchestration, IPC bridge, and tray/window behavior.

## Electron Tree

Curated tree:

```text
electron/
|- main.ts
|- backend.ts
|- orthanc.ts
|- llm.ts
|- window.ts
|- ipc.ts
|- preload.ts
|- tsconfig.json
`- electron-builder.config.js
```

## Key Files

1. [`main.ts`](../../electron/main.ts#L60): app lifecycle entrypoint and process wiring.
2. [`backend.ts`](../../electron/backend.ts#L38): backend process startup/stop and port management.
3. [`orthanc.ts`](../../electron/orthanc.ts#L39): Orthanc startup/auth helpers.
4. [`llm.ts`](../../electron/llm.ts#L44): local LLM process management.
5. [`window.ts`](../../electron/window.ts#L99): `BrowserWindow` and tray behavior.
6. [`ipc.ts`](../../electron/ipc.ts#L7): IPC handler registration.
7. [`preload.ts`](../../electron/preload.ts#L46): secure renderer bridge.

## Runtime Lifecycle

Startup sequence in [`main.ts`](../../electron/main.ts):

1. Enforce single-instance lock ([`main.ts`](../../electron/main.ts#L32)).
2. Optionally start Orthanc container in [`main.ts`](../../electron/main.ts#L63) with [`orthanc.ts`](../../electron/orthanc.ts#L39).
3. Configure Orthanc auth interceptors in [`main.ts`](../../electron/main.ts#L65) with [`orthanc.ts`](../../electron/orthanc.ts#L12).
4. Start backend and wait for healthy state in [`main.ts`](../../electron/main.ts#L67) with [`backend.ts`](../../electron/backend.ts#L38).
5. Optionally start LLM service in [`main.ts`](../../electron/main.ts#L76) with [`llm.ts`](../../electron/llm.ts#L44).
6. Register IPC handlers in [`main.ts`](../../electron/main.ts#L86) with [`ipc.ts`](../../electron/ipc.ts#L7).
7. Create tray and main window in [`main.ts`](../../electron/main.ts#L87) and [`main.ts`](../../electron/main.ts#L48).

Shutdown sequence:

1. Stop backend process ([`main.ts`](../../electron/main.ts#L118)).
2. Stop LLM process ([`main.ts`](../../electron/main.ts#L119)).
3. Optionally stop Orthanc container in [`main.ts`](../../electron/main.ts#L122) with [`orthanc.ts`](../../electron/orthanc.ts#L60).

## Dev vs Production

Dev:

1. Electron loads React dev server (`localhost:3000`).
2. Backend usually runs via uvicorn path from npm scripts.
3. Script and resource resolution paths are handled in [`backend.ts`](../../electron/backend.ts) and [`llm.ts`](../../electron/llm.ts).

Production:

1. Electron loads packaged frontend build.
2. Backend binary runs from resources path.
3. Runtime orchestration is handled fully in desktop process.

## IPC and Security Boundaries

1. Renderer runs with context isolation.
2. Node integration is disabled in renderer context.
3. Preload exposes minimal APIs over explicit IPC channels.

Implementation references:

1. IPC handlers: [`ipc.ts`](../../electron/ipc.ts#L11)
2. Renderer bridge: [`preload.ts`](../../electron/preload.ts#L46)

## Tray and Window Behavior

1. Closing window hides app to tray by default.
2. App remains active until explicit quit action.
3. Window state persistence is managed by [`window.ts`](../../electron/window.ts#L99).

Lifecycle hooks:

1. `window-all-closed`: [`main.ts`](../../electron/main.ts#L102)
2. `activate`: [`main.ts`](../../electron/main.ts#L110)
3. `before-quit`: [`main.ts`](../../electron/main.ts#L116)

## Operational Caveats

1. Signal behavior differs between dev wrappers and packaged runtime.
2. Windows dev cleanup depends on script wrappers in some paths.
3. Duplicate LLM process startup must be guarded to avoid port conflicts ([`llm.ts`](../../electron/llm.ts#L12)).
