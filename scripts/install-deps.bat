@echo off
title VentasPro - Instalando dependencias
color 0B

set ROOT=%~dp0..
cd /d "%ROOT%"

echo.
echo  ============================================
echo    VentasPro - Instalando dependencias
echo  ============================================
echo.

echo  [1/2] Instalando dependencias raiz...
call npm install
if %errorlevel% neq 0 ( echo ERROR en raiz & pause & exit /b 1 )

echo.
echo  [2/2] Instalando dependencias del frontend...
cd /d "%ROOT%\frontend"
call npm install
if %errorlevel% neq 0 ( echo ERROR en frontend & pause & exit /b 1 )

echo.
echo  ============================================
echo    Dependencias instaladas correctamente!
echo  ============================================
echo.
echo  Ahora ejecuta: start-ventaspro.bat
echo.
pause
