# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

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
    'psycopg_binary._psycopg',
    'psycopg_binary.pq',
    'passlib.handlers.bcrypt',
    'win32crypt',
    'app.main',
    'matplotlib',
    'matplotlib.pyplot',
    'matplotlib.backends.backend_agg',
    'app.api.inference.infer_primary_analysis_api',
    'app.api.inference.infer_secondary_analysis_api',
    'app.api.inference.infer_motion_segmentation_api',
    'app.api.inference.infer_linear_measurements_api',
    'app.api.inference.infer_spectral_measurements_api',
    'app.services.inference.secondary_analysis_service',
    'app.services.pipeline.stages.combined',
    'app.services.pipeline.stages.dynamic_measurements',
    'app.AI_models.measurements.runner_2d',
    'app.AI_models.measurements.runner_doppler',
]

# Data files
datas = [
    ('../app/configs', 'app/configs'),
    ('../app/prompting', 'app/prompting'),
]
datas += collect_data_files('fido2')
datas += collect_data_files('matplotlib')

# Binaries - include torch and CUDA libraries if present
binaries = []
binaries += collect_dynamic_libs('psycopg_binary')

a = Analysis(
    ['launcher.py'],
    pathex=['..'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=['hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'transformers.models.qwen2',
        'transformers.models.qwen2_5_omni',
        'transformers.models.qwen2_5_vl',
        'transformers.models.qwen2_audio',
        'transformers.models.qwen2_moe',
        'transformers.models.qwen2_vl',
        'transformers.models.qwen3',
        'transformers.models.qwen3_moe',
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
