# ============================================================
#  VentasPro - Configuracion automatica de Cloudflare Tunnel
#  Ejecutar como Administrador en PowerShell
# ============================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  VentasPro - Setup Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar/instalar cloudflared
Write-Host "[1/5] Verificando cloudflared..." -ForegroundColor Yellow
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Write-Host "     Instalando cloudflared..." -ForegroundColor Gray
    winget install Cloudflare.cloudflared
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    Write-Host "     cloudflared instalado." -ForegroundColor Green
} else {
    Write-Host "     cloudflared ya instalado: $($cf.Source)" -ForegroundColor Green
}

# 2. Login
Write-Host ""
Write-Host "[2/5] Iniciando sesion en Cloudflare..." -ForegroundColor Yellow
Write-Host "     Se abrira el navegador. Selecciona 'zhinoism.online' y autoriza." -ForegroundColor Gray
Write-Host "     Presiona ENTER cuando termines de autorizar en el navegador..."
cloudflared tunnel login
Read-Host

# 3. Crear tunel
Write-Host ""
Write-Host "[3/5] Creando tunel 'ventaspro'..." -ForegroundColor Yellow
$output = cloudflared tunnel create ventaspro 2>&1
Write-Host $output

# Extraer tunnel ID
$tunnelId = ($output | Select-String -Pattern "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").Matches[0].Value
if (-not $tunnelId) {
    # Puede que ya exista, obtenerlo
    $listOutput = cloudflared tunnel list 2>&1
    $tunnelId = ($listOutput | Select-String -Pattern "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").Matches[0].Value
}
Write-Host "     Tunnel ID: $tunnelId" -ForegroundColor Green

# 4. Crear config.yml
Write-Host ""
Write-Host "[4/5] Creando archivo de configuracion..." -ForegroundColor Yellow
$cfDir = "$env:USERPROFILE\.cloudflared"
$credFile = "$cfDir\$tunnelId.json"
$configContent = @"
tunnel: $tunnelId
credentials-file: $credFile

ingress:
  - hostname: zhinoism.online
    service: http://localhost:5173
  - hostname: www.zhinoism.online
    service: http://localhost:5173
  - service: http_status:404
"@
$configContent | Out-File -FilePath "$cfDir\config.yml" -Encoding UTF8
Write-Host "     Config guardada en $cfDir\config.yml" -ForegroundColor Green

# Crear DNS
Write-Host ""
Write-Host "[5/5] Creando registros DNS en Cloudflare..." -ForegroundColor Yellow
cloudflared tunnel route dns ventaspro zhinoism.online
cloudflared tunnel route dns ventaspro www.zhinoism.online
Write-Host "     DNS configurado." -ForegroundColor Green

# Instalar como servicio Windows
Write-Host ""
Write-Host "[Extra] Instalando como servicio de Windows..." -ForegroundColor Yellow
cloudflared service install
Start-Service cloudflared -ErrorAction SilentlyContinue
Write-Host "     Servicio instalado. Se iniciara automaticamente con Windows." -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  CONFIGURACION COMPLETADA" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Tunnel ID : $tunnelId" -ForegroundColor White
Write-Host "  URL       : https://zhinoism.online" -ForegroundColor White
Write-Host ""
Write-Host "  Ahora ejecuta: start-ventaspro.bat" -ForegroundColor Cyan
Write-Host ""
