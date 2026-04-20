@echo off
title VentasPro - Servidor Local
color 0B

echo.
echo  ============================================
echo    VentasPro - Servidor Local
echo  ============================================
echo.

:: Ubicar la raiz del proyecto
set ROOT=%~dp0..
cd /d "%ROOT%\frontend"

:: ── 1. Verificar Vercel CLI ──────────────────────────────────────────────────
where vercel >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [!] Vercel CLI no encontrado. Instalando globalmente...
    call npm install -g vercel
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] No se pudo instalar Vercel CLI.
        echo          Ejecuta manualmente: npm install -g vercel
        pause & exit /b 1
    )
    echo  [OK] Vercel CLI instalado.
    echo.
)

:: ── 2. Vincular proyecto Vercel (solo la primera vez) ────────────────────────
if not exist ".vercel\project.json" (
    echo  [*] Primera vez: vinculando con tu proyecto Vercel...
    echo.
    echo      Cuando pregunte:
    echo        - Set up and develop? -> Y
    echo        - Which scope?        -> tu cuenta personal
    echo        - Link to existing?   -> Y
    echo        - Project name?       -> ventas-appforbrandonanditzel
    echo.
    call vercel link
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] No se pudo vincular el proyecto.
        pause & exit /b 1
    )
    echo.
)

:: ── 3. Descargar variables de entorno de Vercel ──────────────────────────────
echo  [*] Sincronizando variables de entorno desde Vercel...
call vercel env pull .env.local --yes 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [!] No se pudieron descargar las env vars automaticamente.
    if not exist ".env.local" (
        echo.
        echo  [ERROR] Tampoco existe .env.local localmente.
        echo          Crea frontend\.env.local con estas variables:
        echo.
        echo    VITE_SUPABASE_URL=https://xxxx.supabase.co
        echo    VITE_SUPABASE_ANON_KEY=eyJhbGci...
        echo    VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
        echo    SUPABASE_URL=https://xxxx.supabase.co
        echo    SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
        echo    CLERK_SECRET_KEY=sk_live_...
        echo.
        pause & exit /b 1
    ) else (
        echo  [OK] Usando .env.local existente.
    )
) else (
    echo  [OK] Variables de entorno actualizadas.
)

:: ── 4. Instalar dependencias si faltan ───────────────────────────────────────
if not exist "node_modules" (
    echo.
    echo  [*] Instalando dependencias del frontend...
    call npm install
)

:: ── 5. Iniciar con vercel dev ────────────────────────────────────────────────
echo.
echo  ============================================
echo    Abre en tu navegador:
echo    http://localhost:3000
echo.
echo    Frontend + API funcionando juntos.
echo    Presiona Ctrl+C para detener.
echo  ============================================
echo.

call vercel dev --listen 3000
