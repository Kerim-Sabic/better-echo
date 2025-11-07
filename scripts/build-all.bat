@echo off
echo ==========================================
echo Building Echocardiology Desktop App
echo ==========================================
echo.

cd /d "%~dp0\.."

echo Step 1: Building Electron main process...
call npm run build:electron

echo.
echo Step 2: Building React frontend...
call npm run build:frontend

echo.
echo Step 3: Building Python backend with PyInstaller...
echo   (This may take several minutes...)
call npm run build:backend

echo.
echo ==========================================
echo Build Complete!
echo ==========================================
echo.
echo Backend executable: backend\dist\api\
echo Frontend build: frontend\build\
echo Electron build: dist\electron\
echo.
echo Next step: Run 'npm run dist' to create installers
echo.
pause
