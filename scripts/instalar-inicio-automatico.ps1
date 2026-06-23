# Instala acceso directo en Inicio de Windows (arranque con la PC)
# Modos: Navegador (recomendado para probar) | Electron (exe portable)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\instalar-inicio-automatico.ps1

param(
  [ValidateSet('navegador', 'electron')]
  [string]$Modo = 'navegador'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder 'POS CONTROL 3B.lnk'

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

if ($Modo -eq 'electron') {
  $Exe = Get-ChildItem -Path (Join-Path $ProjectRoot 'release') -Filter 'POS-3B-*-portable.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $Exe) {
    Write-Host 'ERROR: No hay .exe portable. Ejecuta primero: npm run electron:build' -ForegroundColor Red
    exit 1
  }
  $Shortcut.TargetPath = $Exe.FullName
  $Shortcut.WorkingDirectory = $Exe.DirectoryName
  $Shortcut.Description = 'POS CONTROL 3B (Electron)'
} else {
  $Launcher = Join-Path $ProjectRoot 'scripts\iniciar-pos-navegador.ps1'
  $Shortcut.TargetPath = 'powershell.exe'
  $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
  $Shortcut.WorkingDirectory = $ProjectRoot
  $Shortcut.Description = 'POS CONTROL 3B (navegador + servidor local)'
}

$Shortcut.Save()

Write-Host "Instalado en Inicio de Windows:" -ForegroundColor Green
Write-Host "  $ShortcutPath"
Write-Host "  Modo: $Modo"
Write-Host ''
Write-Host 'Para quitar: scripts\quitar-inicio-automatico.ps1' -ForegroundColor DarkGray
