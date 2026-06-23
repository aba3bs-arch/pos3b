$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder 'POS CONTROL 3B.lnk'
if (Test-Path $ShortcutPath) {
  Remove-Item $ShortcutPath -Force
  Write-Host 'Acceso directo de inicio automático eliminado.' -ForegroundColor Green
} else {
  Write-Host 'No había acceso directo instalado.' -ForegroundColor Yellow
}
