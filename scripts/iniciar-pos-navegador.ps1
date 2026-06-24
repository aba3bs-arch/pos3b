# POS 3B - Modo navegador (Chrome/Edge en ventana de app + servidor local)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\iniciar-pos-navegador.ps1
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Port = 4173
$Url = "http://127.0.0.1:$Port"

function Test-PortOpen([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $p)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Node.js no esta instalado. Descargalo de https://nodejs.org' -ForegroundColor Red
  Read-Host 'Enter para salir'
  exit 1
}

if (-not (Test-Path 'dist\index.html')) {
  Write-Host 'Compilando POS (primera vez)...' -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Instalando dependencias...' -ForegroundColor Yellow
  npm install
}

$browser = Find-Browser
if (-not $browser) {
  Write-Host 'ERROR: No se encontro Chrome ni Edge.' -ForegroundColor Red
  Read-Host 'Enter para salir'
  exit 1
}

if (-not (Test-PortOpen $Port)) {
  Write-Host "Iniciando servidor local en puerto $Port (puede tardar 1-2 minutos)..." -ForegroundColor Cyan
  $vite = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path $vite)) {
    Write-Host 'ERROR: Falta node_modules. Ejecuta: npm install' -ForegroundColor Red
    Read-Host 'Enter para salir'
    exit 1
  }
  Start-Process -FilePath 'node' -ArgumentList @(
    $vite, 'preview', '--host', '127.0.0.1', '--port', "$Port"
  ) -WorkingDirectory $ProjectRoot -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-PortOpen $Port)) {
    Write-Host 'ERROR: El servidor no respondio a tiempo.' -ForegroundColor Red
    Write-Host 'Prueba manual en esta carpeta:' -ForegroundColor Yellow
    Write-Host '  npm run dev' -ForegroundColor Yellow
    Write-Host '  y abre http://localhost:5173' -ForegroundColor Yellow
    Read-Host 'Enter para salir'
    exit 1
  }
} else {
  Write-Host "Servidor ya activo en puerto $Port" -ForegroundColor DarkGray
}

Write-Host "Abriendo POS: $Url" -ForegroundColor Green
Start-Process $browser -ArgumentList @("--app=$Url", '--start-maximized')

Write-Host 'Listo. Cierra la ventana del POS; el servidor sigue en segundo plano.' -ForegroundColor DarkGray
Write-Host 'Para detener el servidor: Administrador de tareas, proceso node.exe (preview)' -ForegroundColor DarkGray