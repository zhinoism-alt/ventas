@echo off
title Configurar inicio automatico - VentasPro
color 0B

echo.
echo  ============================================
echo    Configurando inicio automatico...
echo  ============================================
echo.

:: Ruta de la carpeta Startup de Windows
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

:: Ruta del script principal (relativo a este .bat)
set ROOT=%~dp0
set BAT_PATH=%ROOT%iniciar-ventaspro.bat
set VBS_PATH=%ROOT%iniciar-ventaspro-silencioso.vbs

:: Crear un .vbs que lanza el servidor sin ventana de CMD molesta
echo Set oShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo oShell.Run """%BAT_PATH%""", 1, False >> "%VBS_PATH%"

:: Crear acceso directo en la carpeta Startup
set SHORTCUT=%STARTUP%\VentasPro.lnk

powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%VBS_PATH%'; $s.WorkingDirectory='%ROOT%'; $s.Description='VentasPro - Servidor Local'; $s.Save()"

if exist "%SHORTCUT%" (
    echo  [OK] VentasPro se abrira automaticamente al encender la computadora.
    echo.
    echo       Acceso directo creado en:
    echo       %SHORTCUT%
    echo.
    echo  Para desactivarlo, abre la carpeta:
    echo       %STARTUP%
    echo  y borra el acceso directo "VentasPro".
) else (
    echo  [ERROR] No se pudo crear el acceso directo automaticamente.
    echo.
    echo  Hazlo manualmente:
    echo    1. Presiona Win + R
    echo    2. Escribe: shell:startup
    echo    3. Copia "iniciar-ventaspro.bat" a esa carpeta
)

echo.
pause
