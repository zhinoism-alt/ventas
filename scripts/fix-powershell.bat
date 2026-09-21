@echo off
title Fix PowerShell - VentasPro
color 0E

echo.
echo  Habilitando ejecucion de scripts en PowerShell...
echo.

powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"

echo.
echo  Listo! Ahora ejecuta: npm run install:all
echo.
pause
