# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all submodules
hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'sqlalchemy.sql.default_comparator',
    'passlib.handlers.bcrypt',
    'app.api.upload',
    'app.api.studies',
    'app.api.infer_panecho',
    'app.api.infer_echoprime',
    'app.api.infer_echonet_dynamic',
    'app.api.infer_measurements',
    'app.api.authentication',
    'app.api.llm',
    'app.api.results.combined_panecho_echoprime_api',
    'app.api.results.combined_dynamic_measurements_api',
    'app.api.results.llm_report_get_api',
    'app.api.pipeline.pipeline_start_api',
    'app.api.pipeline.pipeline_status_api',
    'app.api.pipeline.pipeline_promote_api',
    'app.api.pipeline.pipeline_cancel_api',
    'app.api.pipeline.pipeline_regenerate_api',
]

# Data files
datas = [
    ('../app/configs', 'app/configs'),
    ('../app/prompting', 'app/prompting'),
    ('../.env', '.'),
]

# Binaries - include torch and CUDA libraries if present
binaries = []

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    # Console window for backend process in packaged app.
    # Set to True to show console for debugging.
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='api',
)
