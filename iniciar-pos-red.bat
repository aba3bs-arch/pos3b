@echo off
title POS CONTROL 3B - Red local
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-pos-red.ps1"
pause
