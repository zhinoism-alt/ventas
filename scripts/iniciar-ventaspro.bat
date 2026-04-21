@echo off
title VentasPro - Local
color 0A

echo.
echo  ============================================
echo    VentasPro  ^|  Servidor Local
echo  ============================================
echo.

:: Ir al directorio del frontend
set ROOT=%~dp0..
cd /d "%ROOT%\frontend"

:: Instalar dependencias si no existen
if not exist "node_modules" (
    echo  [*] Instalando dependencias por primera vez...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] npm install fallo. Verifica que Node.js este instalado.
        pause & exit /b 1
    )
    echo  [OK] Dependencias instaladas.
    echo.
)

:: Abrir el navegador despues de 3 segundos (da tiempo a que Vite arranque)
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"

echo  ============================================
echo    Abriendo: http://localhost:5173
echo.
echo    Presiona Ctrl+C para detener el servidor.
echo  ============================================
echo.

:: Arrancar Vite
call npm run dev
