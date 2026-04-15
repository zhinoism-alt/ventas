@echo off
title VentasPro - Iniciando...
color 0B

echo.
echo  ============================================
echo    VentasPro - Iniciando sistema
echo  ============================================
echo.

:: Ubicar la raiz del proyecto (carpeta padre de scripts\)
set ROOT=%~dp0..
cd /d "%ROOT%"

:: Verificar que existe .env
if not exist backend\.env (
    echo  [ERROR] No se encontro backend\.env
    echo  Copia backend\.env.example a backend\.env y configura las variables.
    echo.
    pause
    exit /b 1
)

:: Verificar que node_modules existen
if not exist backend\node_modules (
    echo  Instalando dependencias del backend...
    cd backend && npm install && cd ..
)
if not exist frontend\node_modules (
    echo  Instalando dependencias del frontend...
    cd frontend && npm install && cd ..
)

echo  Iniciando Backend  (http://localhost:3001)
echo  Iniciando Frontend (http://localhost:5173)
echo  Tunel Cloudflare   (https://zhinoism.online)
echo.
echo  Presiona Ctrl+C para detener.
echo.

:: Iniciar backend y frontend en paralelo
start "VentasPro Backend" cmd /k "cd /d %ROOT%\backend && node index.js"
timeout /t 2 /nobreak >/dev/null
start "VentasPro Frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"

echo  Sistema iniciado. Abre https://zhinoism.online en tu navegador.
echo.
pause
