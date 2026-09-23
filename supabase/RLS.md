# Cerrar el acceso anonimo (RLS)

**Estado: cerrado el 2026-09-22.** RLS esta activo en las 31 tablas de
`public`, cada una con una sola politica (`clerk_autenticados`, FOR ALL TO
authenticated). La anon key sigue siendo publica por diseno — sigue viajando
en el bundle del navegador — pero ya no sirve para leer ni escribir nada:
una consulta con solo esa key devuelve `200` con `[]`, no un error, pero
tampoco datos. Esta pagina queda como historial de como se llego ahi.

## El problema que tenia

Hoy, cualquiera con la URL desplegada podia leer y escribir el presupuesto,
los ahorros, los gastos de pareja y el sueldo. Sin iniciar sesion.

## Por que no estaba resuelto

La app autentica con Clerk, pero Clerk no estaba registrado en Supabase
como Third-Party Auth. Una version anterior intentaba mandar un JWT de
Clerk con un template `supabase` que no existia; al no poder validarlo,
Supabase respondia 401 a todo. Ese codigo se quito.

Sin esa integracion no hay forma de que Supabase sepa quien es el usuario,
y sin eso no se puede escribir una politica de RLS que no bloquee la app.

## Lo que de verdad bloqueo la activacion

Los pasos 1 y 2 de abajo (el claim en Clerk, el proveedor en Supabase) ya
estaban bien hechos de antes. Lo que fallaba era otra cosa: Supabase
rechazaba el JWT de Clerk con

    PGRST301 - No suitable key was found to decode the JWT

pese a que el JWKS de Clerk (`https://shining-beagle-73.clerk.accounts.dev/
.well-known/jwks.json`) publicaba en publico la llave exacta que el token
pedia. El proveedor de Clerk en Supabase habia quedado con la confianza en
cache desde que se registro y nunca se refresco.

**Arreglo:** en Supabase, Authentication -> Third-Party Auth -> Clerk ->
`Delete integration`, y volver a agregarlo con el mismo dominio. Eso forzo
a PostgREST a releer el JWKS. No hizo falta tocar Clerk, la migracion, ni
esperar a ningun incidente de Supabase.

Aparte, al activar RLS aparecieron 18 tablas con politicas de un intento
anterior a esta sesion (`anon_all`, que le daba paso al rol anonimo, y
`auth_all`, redundante) que sobrevivian junto a la nueva y hubiera dejado
esas 18 tablas tan abiertas como antes. Se limpiaron en
`supabase/migrations/20260922010000_limpiar_politicas_viejas.sql`.

## Como quedo armado

### 1. Clerk — claim `role`

Dashboard de Clerk (instancia `shining-beagle-73.clerk.accounts.dev`) ->
Configure -> Sessions -> Customize session token:

    { "role": "authenticated" }

### 2. Supabase — Clerk como Third-Party Auth

Authentication -> Sign In / Providers -> Third-Party Auth -> Clerk,
dominio `shining-beagle-73.clerk.accounts.dev`. Si alguna vez vuelve el
PGRST301, el arreglo es quitar y volver a agregar este proveedor (arriba).

### 3. La app firma con el token de Clerk

`VITE_SUPABASE_CLERK_AUTH=true` en `frontend/.env.local` y en Vercel
(Production). Con la bandera apagada, `supabase.ts` cae a la anon key en
vez de dejar la app ciega — ver el comentario ahi mismo.

### 4. RLS activo

`supabase/migrations/20260922000000_rls.sql` — una sola politica por tabla,
`clerk_autenticados`, para los tres que usan la app.

## Que NO cubre esto

La politica es "cualquier usuario autenticado ve todo". Son tres personas
compartiendo un sistema domestico y no hay datos que separar entre ellas.

Si algun dia quieres que cada quien vea solo lo suyo, hace falta una columna
de propietario por tabla y politicas del tipo
`auth.jwt()->>'sub' = usuario_id`. Es otro trabajo.

## Pendiente aparte

La instancia de Clerk sigue siendo de **desarrollo** (`pk_test_`, dominio
`.clerk.accounts.dev`) corriendo en produccion. Las instancias de
desarrollo tienen limites de usuarios y sesiones mas cortas, y no estan
pensadas para uso real. Migrar a produccion cambia la publishable key y el
dominio — y por lo tanto tambien el valor del paso 2 de arriba.
