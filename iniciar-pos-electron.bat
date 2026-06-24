@echo off
title POS CONTROL 3B - Electron
cd /d "%~dp0"
if exist "release\POS-3B-1.0.0-portable.exe" (
  start "" "release\POS-3B-1.0.0-portable.exe"
  exit /b 0
)
if exist "release\win-unpacked\POS CONTROL 3B.exe" (
  start "" "release\win-unpacked\POS CONTROL 3B.exe"
  exit /b 0
)
echo No hay .exe compilado. Genera uno con:
echo   npm run electron:build
echo.
echo O prueba en desarrollo:
echo   npm run electron:dev
pause
