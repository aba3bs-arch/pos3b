# POS 3B - Modo red local (PC + celular/tablet en la misma Wi-Fi)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\iniciar-pos-red.ps1
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Port = 5173
$UrlLocal = "http://127.0.0.1:$Port"

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

function Get-LanIPv4 {
  $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.InterfaceAlias -notmatch 'vEthernet|Virtual|VPN|Tailscale|Loopback'
    }
  $preferred = $addrs | Where-Object {
    $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)'
  } | Select-Object -First 1
  if ($preferred) { return $preferred.IPAddress }
  $fallback = $addrs | Select-Object -First 1
  if ($fallback) { return $fallback.IPAddress }
  return $null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Node.js no esta instalado. Descargalo de https://nodejs.org' -ForegroundColor Red
  Read-Host 'Enter para salir'
  exit 1
}

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Instalando dependencias...' -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$browser = Find-Browser
if (-not $browser) {
  Write-Host 'ERROR: No se encontro Chrome ni Edge.' -ForegroundColor Red
  Read-Host 'Enter para salir'
  exit 1
}

if (-not (Test-PortOpen $Port)) {
  Write-Host "Iniciando servidor en red local (puerto $Port)..." -ForegroundColor Cyan
  $vite = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path $vite)) {
    Write-Host 'ERROR: Falta node_modules. Ejecuta: npm install' -ForegroundColor Red
    Read-Host 'Enter para salir'
    exit 1
  }
  Start-Process -FilePath 'node' -ArgumentList @($vite) -WorkingDirectory $ProjectRoot -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-PortOpen $Port)) {
    Write-Host 'ERROR: El servidor no respondio a tiempo.' -ForegroundColor Red
    Write-Host 'Prueba manual: npm run dev' -ForegroundColor Yellow
    Read-Host 'Enter para salir'
    exit 1
  }
} else {
  Write-Host "Servidor ya activo en puerto $Port" -ForegroundColor DarkGray
}

$lanIp = Get-LanIPv4
$UrlRed = if ($lanIp) { "http://${lanIp}:$Port" } else { $null }

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  POS CONTROL 3B - MODO RED LOCAL' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "  En esta PC:     $UrlLocal" -ForegroundColor Green
if ($UrlRed) {
  Write-Host "  En el celular:  $UrlRed" -ForegroundColor Yellow
  Write-Host '  (Misma Wi-Fi; abre esa URL en Chrome o Safari)' -ForegroundColor DarkGray
} else {
  Write-Host '  En el celular:  no se detecto IP de red' -ForegroundColor Yellow
  Write-Host '  Ejecuta ipconfig y usa http://TU-IP:5173' -ForegroundColor DarkGray
}
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Write-Host "Abriendo POS en esta PC: $UrlLocal" -ForegroundColor Green
Start-Process $browser -ArgumentList @("--app=$UrlLocal", '--start-maximized')

Write-Host 'Listo. Celular y PC deben estar en la misma Wi-Fi.' -ForegroundColor DarkGray
Write-Host 'Si el celular no carga, permite Node.js en el Firewall de Windows.' -ForegroundColor DarkGray
Write-Host 'Para detener el servidor: Administrador de tareas, proceso node.exe' -ForegroundColor DarkGray
