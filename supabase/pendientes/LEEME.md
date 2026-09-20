# Migraciones que NO deben aplicarse todavia

Esta carpeta esta fuera de `supabase/migrations/` a proposito. El CLI solo
aplica lo que vive en `migrations/`, asi que nada de aqui se ejecuta por
accidente con `supabase db push`.

## 20260919010000_rls.sql

Activa Row Level Security en todas las tablas. **Aplicarla hoy deja la app
sin leer nada.**

RLS solo funciona cuando Supabase puede validar el token de Clerk, y eso
sigue roto: PostgREST responde `PGRST301 - No suitable key was found to
decode the JWT`. Es un incidente abierto de Supabase ("401 errors due to
JWT rejections"), no un problema de configuracion — los pasos 1 y 2 del
runbook ya estan hechos y verificados.

Cuando el incidente cierre y el paso 3 de `supabase/RLS.md` pase (el token
de Clerk devuelve 200 en vez de 401), mueve este archivo de vuelta a
`supabase/migrations/` y aplicalo.
