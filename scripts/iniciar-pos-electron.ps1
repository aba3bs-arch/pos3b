# Desarrollo: ventana Electron + servidor Vite
# Uso: powershell -ExecutionPolicy Bypass -File scripts\iniciar-pos-electron.ps1

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Instala Node.js desde https://nodejs.org' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path 'node_modules\electron')) {
  Write-Host 'Instalando dependencias (incluye Electron)...' -ForegroundColor Yellow
  npm install
}

Write-Host 'Iniciando POS en Electron (modo desarrollo)...' -ForegroundColor Cyan
npm run electron:dev
