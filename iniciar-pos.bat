@echo off
title POS CONTROL 3B
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-pos-navegador.ps1"
pause
