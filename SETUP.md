# VentasPro — Guia de Setup Completo

## Usuarios del sistema

| Usuario   | Contraseña       | Rol       |
|-----------|------------------|-----------|
| zhinoism  | <ver gestor de contraseñas>  | Admin     |
| Brandon   | <ver gestor de contraseñas>     | Editor    |
| Itzel     | <ver gestor de contraseñas>       | Editor    |

> **Las contrasenas NO van en este archivo** — esta versionado en GitHub.
> Guardalas en un gestor de contrasenas. Si alguna vez estuvieron aqui en
> texto plano, rotalas: el historial de git las conserva.  
> Para generar nuevos hashes: `node -e "require('bcryptjs').hash('NUEVA_PASS', 12).then(console.log)"`

---

## Paso 1 — Copiar archivos modificados

Los siguientes archivos fueron actualizados, copialos a tu proyecto:

```
backend/.env                    ← NUEVO (credenciales)
backend/database.js             ← ACTUALIZADO (tablas WhatsApp)
backend/routes/whatsapp.js      ← ACTUALIZADO (auto-respuestas)
frontend/src/App.tsx            ← ACTUALIZADO (menu Personal)
frontend/src/pages/Personal.tsx ← NUEVO (planes personales)
scripts/setup-cloudflare.ps1    ← ACTUALIZADO (api.zhinoism.online)
```

---

## Paso 2 — Instalar dependencias

Desde la raiz del proyecto:
```bash
npm run install:all
```

---

## Paso 3 — Configurar Cloudflare Tunnel (una sola vez)

1. Abre PowerShell **como Administrador**
2. Ejecuta:
   ```powershell
   .\scripts\setup-cloudflare.ps1
   ```
3. Se abrira el navegador — selecciona `zhinoism.online` y autoriza
4. El script crea el tunel y configura el DNS automaticamente

**Resultado:**
- `https://zhinoism.online` → Frontend (React)
- `https://api.zhinoism.online` → Backend (API directa)

---

## Paso 4 — Arrancar la app

```bat
scripts\start-ventaspro.bat
```

Esto inicia:
- Backend en `http://localhost:3001`
- Frontend en `http://localhost:5173`
- Vite hace proxy de `/api` → backend automaticamente

---

## Paso 5 — Activar WhatsApp Bot (opcional)

1. Instala dependencias extra en `/backend`:
   ```bash
   cd backend
   npm install whatsapp-web.js qrcode
   ```
2. En `backend/.env` cambia:
   ```
   WHATSAPP_ENABLED=true
   ```
3. Reinicia el backend
4. Desde la app, ve a la seccion IPTV → pestaña WhatsApp
5. Escanea el QR con tu WhatsApp

**Funciones del bot:**
- Auto-respuesta inteligente cuando alguien pregunta por precios o renovacion
- Detecta si el numero ya tiene una suscripcion activa y personaliza la respuesta
- Cooldown de 30 minutos (no spam)
- Envio masivo de recordatorios de renovacion programados
- Historial de mensajes en la BD

---

## Paso 6 — Seccion Personal

Desde el menu lateral → **Personal**, puedes agregar URLs a:
- Plan de Mudanza
- Mejora de Peso - Brandon
- Mejora de Peso - Itzel
- Terapia
- Presupuesto (Google Sheets ya configurado)

Pega cualquier URL de Google Docs, Notion, o cualquier pagina embebible.

---

## Despliegue en servidor VPS (opcional)

Si prefieres no depender de tu PC:

### Con DigitalOcean / Linode / Hetzner

1. Crea un droplet Ubuntu 22 ($6/mes)
2. Instala Node.js 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
3. Sube el proyecto (git clone o rsync)
4. Instala PM2 para mantener el proceso vivo:
   ```bash
   npm install -g pm2
   cd backend && npm install
   pm2 start index.js --name ventaspro-backend
   pm2 save
   ```
5. Build del frontend:
   ```bash
   cd frontend && npm install && npm run build
   ```
6. Sirve el build con nginx o con el propio backend
7. Instala cloudflared en el servidor y configura el tunel igual

### Con Cloudflare Tunnel desde tu PC (recomendado para empezar)
El tunel de Cloudflare funciona excelente desde tu computadora de escritorio.
Solo necesitas que tu PC este prendida y con internet para que `zhinoism.online` funcione.

