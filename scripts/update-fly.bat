@echo off
chcp 65001 >nul
title Brandon Dashboard — Actualizar en Fly.io

echo.
echo Subiendo actualizaciones a Fly.io...
echo.

cd /d "%~dp0.."
flyctl deploy --app brandon-dashboard

if %ERRORLEVEL% equ 0 (
    echo.
    echo Actualizacion exitosa: https://brandon-dashboard.fly.dev
) else (
    echo ERROR en el deploy. Revisa los mensajes arriba.
)
pause
