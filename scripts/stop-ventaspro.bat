@echo off
title VentasPro - Deteniendo...
echo.
echo  Deteniendo VentasPro...
taskkill /FI "WINDOWTITLE eq VentasPro Backend*" /F >/dev/null 2>&1
taskkill /FI "WINDOWTITLE eq VentasPro Frontend*" /F >/dev/null 2>&1
echo  Listo.
echo.
