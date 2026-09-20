# Cerrar el acceso anonimo (RLS)

## El problema

RLS esta apagado en las 24 tablas y la anon key viaja dentro del bundle
publico del navegador — es publica por diseno en Supabase; lo que protege
los datos es RLS, no esconderla.

Hoy, cualquiera con la URL desplegada puede leer y escribir el presupuesto,
los ahorros, los gastos de pareja y el sueldo. Sin iniciar sesion.

## Por que no estaba resuelto

La app autentica con Clerk, pero **Clerk nunca se registro en Supabase**
(Authentication -> Third-Party Auth esta vacio). Una version anterior
intentaba mandar un JWT de Clerk con un template `supabase` que no existia;
al no poder validarlo, Supabase respondia 401 a todo. Ese codigo se quito.

Sin esa integracion no hay forma de que Supabase sepa quien es el usuario,
y sin eso no se puede escribir una politica de RLS que no bloquee la app.

## Orden de ejecucion

El orden importa. Cada paso deja la app funcionando; invertirlos la rompe.

### 1. Clerk — agregar el claim `role`

Dashboard de Clerk (instancia `shining-beagle-73.clerk.accounts.dev`):

- Busca la pagina **Connect with Supabase**, o ve a
  **Configure -> Sessions -> Customize session token**.
- Agrega al token:

      { "role": "authenticated" }

Sin este claim, Supabase recibe un token valido pero sin rol, y las
politicas de `authenticated` no aplican.

### 2. Supabase — registrar a Clerk

**Authentication -> Sign In / Providers -> Third-Party Auth -> Add provider
-> Clerk**, y pon el dominio:

    shining-beagle-73.clerk.accounts.dev

### 3. Probar el token, todavia sin RLS

En local, agrega a `frontend/.env.local`:

    VITE_SUPABASE_CLERK_AUTH=true

Arranca (`npm run dev --prefix frontend`), entra y navega por Presupuesto,
Ahorros e IPTV.

- **Si todo carga:** la integracion funciona. Sigue al paso 4.
- **Si sale 401 o se vacia:** Supabase no esta aceptando el token. Quita la
  variable, vuelve a cargar y revisa los pasos 1 y 2. La app queda como antes.

Cuando funcione en local, agrega la misma variable en Vercel
(Settings -> Environment Variables, Production) y redespliega.

### 4. Activar RLS

Solo ahora. En el SQL Editor, corre
`supabase/pendientes/20260919010000_rls.sql`.

La consulta final debe devolver `rls_activo = true` y `politicas = 1` en
todas las filas. Vuelve a cargar la app y verifica que sigue leyendo.

Si algo se rompe, al pie de esa migracion esta la reversa comentada: la
corres y vuelves al estado anterior — inseguro pero funcionando — sin prisa.

## Que NO cubre esto

La politica es "cualquier usuario autenticado ve todo". Son tres personas
compartiendo un sistema domestico y no hay datos que separar entre ellas.

Si algun dia quieres que cada quien vea solo lo suyo, hace falta una columna
de propietario por tabla y politicas del tipo
`auth.jwt()->>'sub' = usuario_id`. Es otro trabajo.

## Pendiente aparte

La instancia de Clerk es de **desarrollo** (`pk_test_`, dominio
`.clerk.accounts.dev`). Las instancias de desarrollo tienen limites de
usuarios y sesiones mas cortas, y no estan pensadas para uso real. Migrar a
produccion cambia la publishable key y el dominio — y por lo tanto tambien
el valor del paso 2.
