# Guía de Migración: Fly.io → Supabase + Clerk + Vercel

## Resumen de la arquitectura nueva

| Antes (Fly.io)         | Después (Vercel)              |
|------------------------|-------------------------------|
| Express + SQLite       | Vercel Functions + Supabase   |
| JWT manual (bcrypt)    | Clerk (auth listo)            |
| Un solo servidor       | Frontend (Vercel) sin backend |
| $0/mes (free tier)     | $0/mes (free tier)            |

---

## PASO 1 — Supabase (base de datos)

1. Ve a https://supabase.com → **New project**
2. Nombre: `ventas-prod` | Región: `us-east-1` (más cercana a Juárez)
3. Guarda la contraseña de la DB (la necesitarás si migras datos)
4. Espera ~2 minutos a que el proyecto esté listo

**Obtén las credenciales:**
- Dashboard → Settings → API
- Copia: `Project URL`, `anon key`, `service_role key`

**Corre la migración SQL:**
- Dashboard → SQL Editor → New query
- Copia y pega el contenido de `supabase/migrations/20240415000000_initial.sql`
- Click **Run**

---

## PASO 2 — Clerk (autenticación)

1. Ve a https://clerk.com → **Create application**
2. Nombre: `VentasPro` | Activa Email + Password
3. Obtén las credenciales:
   - Dashboard → API Keys → copia `Publishable key` y `Secret key`

**Crear usuarios:**
- Dashboard → Users → **Create user**

| Nombre  | Email                     | Contraseña      |
|---------|---------------------------|-----------------|
| Brandon | brandon@zhinoism.online   | Br4nd0n$2024    |
| Itzel   | itzel@zhinoism.online     | 1tz3l$2024      |
| Admin   | zhinoism@gmail.com        | Zh1no$Admin2024 |

**Asignar rol admin a zhinoism:**
- Users → click en zhinoism → Metadata → Public:
```json
{ "rol": "admin" }
```
Los demás usuarios quedan como `editor` por default.

**Crear JWT template para Supabase:**
- Dashboard → JWT Templates → New template → **Supabase**
- Nombre: `supabase`
- Signing key: usa el JWT secret de Supabase (Settings → API → JWT Secret)

---

## PASO 3 — Vercel (hosting)

1. Ve a https://vercel.com → **New Project**
2. Import desde GitHub: `zhinoism-alt/ventas`
3. En **Root Directory** selecciona: `frontend`
4. Framework: **Vite**

**Agregar variables de entorno** (en Vercel → Settings → Environment Variables):

```
VITE_SUPABASE_URL          = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJhbGci...
SUPABASE_URL               = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY  = eyJhbGci...
VITE_CLERK_PUBLISHABLE_KEY = pk_live_...
CLERK_SECRET_KEY           = sk_live_...
CRON_SECRET                = [genera uno: openssl rand -hex 32]
VITE_ENABLE_PINECONE       = false
```

PostHog, Sentry, Upstash, Pinecone son **opcionales** — no los necesitas para funcionar.

5. Click **Deploy** 🚀

---

## PASO 4 — Dominio personalizado en Vercel

1. Vercel → tu proyecto → Settings → Domains
2. Agrega: `zhinoism.online` y `www.zhinoism.online`
3. Vercel te dará los DNS records — actualízalos en Cloudflare
4. Cambia SSL en Cloudflare a **Full (strict)**

---

## PASO 5 — 3 cambios en el código antes de hacer push

Antes de hacer deploy, aplica estos cambios a la rama `claude/migrate-hosting-provider-z8OzH`:

### 1. Agregar página Personal a `frontend/src/App.tsx`

Después de `import Presupuesto from './pages/Presupuesto'`, agrega:
```tsx
import Personal from './pages/Personal'
import { Heart } from 'lucide-react'
```

En `navItems`, agrega:
```tsx
{ to: '/personal', icon: <Heart size={18} />, label: 'Personal' },
```

En las `<Routes>`, agrega:
```tsx
<Route path="/personal" element={<Personal />} />
```

### 2. La página Personal ya está en el repositorio
El archivo `frontend/src/pages/Personal.tsx` ya existe — no necesitas crearlo.

### 3. El endpoint de tipo de cambio ya está creado
`frontend/api/exchange-rate/refresh.ts` — listo ✅

---

## Migrar datos existentes de Fly.io a Supabase (opcional)

Si quieres mover tus datos actuales (productos, clientes IPTV, etc.):

```powershell
# En tu PC, desde la carpeta ventas
node scripts/run-migration.mjs
```

Necesitarás las variables de entorno en un `.env` local.

---

## Checklist final

- [ ] Supabase proyecto creado + SQL migración corrida
- [ ] Clerk configurado + 3 usuarios creados + rol admin asignado
- [ ] Vercel: proyecto conectado a GitHub + env vars configuradas
- [ ] 3 cambios de código aplicados (Personal page en App.tsx)
- [ ] Deploy en Vercel exitoso
- [ ] Dominio `zhinoism.online` apuntando a Vercel
- [ ] Login funciona en producción
