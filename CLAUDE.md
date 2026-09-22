# VentasPro

Panel personal de Brandon (Ciudad Juárez, MX). Empezó como control de un negocio
de reventa y creció hasta ser el tablero donde vive todo: el negocio, las
finanzas personales, la escuela y la búsqueda de empleo.

**Producción:** https://bootyandchinix.vercel.app
**Repo:** github.com/zhinoism-alt/ventas — rama por defecto
`claude/inventory-marketplace-automation-K0hqL`

---

## Cómo arrancar

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173
```

El frontend habla directo con Supabase (PostgREST) desde el navegador, y para
lo que necesita un secreto usa **funciones serverless de Vercel**, que viven en
`frontend/api/` y se despliegan junto con el sitio.

**`backend/` no se usa.** Es de la etapa anterior del proyecto y nada lo llama:
lo que parece «el backend» son esas funciones de Vercel. No lo levantes ni
supongas que hace falta.

Antes de dar por terminado un cambio:

```bash
cd frontend && npx tsc --noEmit && npm run build
```

---

## Arquitectura

React 18 + TypeScript + Vite + Tailwind · Supabase (Postgres) · Clerk (sesión) ·
Vercel (despliegue automático al hacer push).

```
frontend/src/
  App.tsx              rutas y layout; las páginas van con lazy()
  contexts/            AuthContext: adaptador sobre Clerk
  lib/
    supabase.ts        cliente único
    useDraft.ts        borradores de formulario (ver abajo)
    presupuestoSheet.ts  lector del presupuesto de Google Sheets
    utils.ts           fmt(), safeFloat(), …
  pages/               una por sección del menú
  components/          piezas compartidas y los módulos financieros
supabase/
  migrations/          se aplican con `npx supabase db push`
  pendientes/          migraciones a propósito FUERA del camino de push
```

### Secciones

**Negocio** — Dashboard, Inventario, IPTV, Presupuesto, Reportes, Sheets Sync
**Vida Personal** — Ahorros, Mudanza, Pareja, Bienestar, Personal, Empleo

`Ahorros` incluye la pestaña **Patrimonio**, que es donde vive el trabajo
financiero pesado: `Patrimonio.tsx`, `Simuladores.tsx` (PPR e INFONAVIT),
`Horizonte.tsx` (UDI e independencia financiera) y `Afore.tsx`.

---

## Convenciones que importan

**Datos.** `supabase.from('tabla')` directo desde el componente. Un `load()`
único en `useEffect`, sin suscripciones en tiempo real. Borrado suave con
`activo: false`. Todo `load()` lleva `try/finally`: sin el `finally`, una
consulta que rechaza deja el spinner girando para siempre.

**Errores visibles.** Nunca un `return` mudo en una validación, y nunca ignorar
el `error` que devuelve Supabase. Si algo no se guardó, el formulario se queda
abierto, con todo lo escrito dentro, y lo dice. Usa `AvisoForm` de
`components/FormAvisos.tsx`.

**Formularios.** Usa `useDraft` para formularios de alta y `useRescate` para los
que viven dentro de un modal. Lo capturado se espeja en `localStorage` mientras
se escribe. Existe porque perder media captura era el fallo más reportado del
tablero.

**Colores.** Solo tokens CSS: `var(--text)`, `var(--bg-card)`, `var(--green)`,
`var(--accent)`… y las utilidades semánticas `.text-strong` `.text-body`
`.text-muted` `.text-dim` `.surface-2` `.bd`. Un hex suelto se ve bien en un
tema y se rompe en el otro. El tema claro es el de base; el oscuro se define en
`:root[data-theme="dark"]` y en el `@media` equivalente.

**Tablas anchas** van envueltas en `.scroll-x` con un `minWidth` en línea, o
desbordan la página entera en el teléfono.

**Idioma.** Interfaz y comentarios en español. Los comentarios explican *por
qué*, no *qué*: si algo se ve raro, casi siempre es porque corrige un error
concreto que ya ocurrió.

---

## Migraciones

```bash
npx supabase db push        # desde la raíz del repo
```

Si se aplican desde el editor SQL del panel de Supabase, hay un diálogo que
ofrece «Run and enable RLS». Para todas las migraciones de este repo la
respuesta es **Run without RLS**: una vez se activó sin querer y todas las
consultas empezaron a devolver vacío, lo que se veía igual que «no hay datos».

`supabase/pendientes/20260919010000_rls.sql` está fuera de `migrations/` a
propósito, para que `db push` no lo aplique. Cuando se active RLS de verdad, esa
es la única que sí va con «Run and enable RLS».

---

## Presupuesto

Lee la hoja «Budget 2026» publicada en Google Sheets, desde el navegador. Google
sirve el CSV publicado con `Access-Control-Allow-Origin: *`, así que no hace
falta backend ni credenciales.

La hoja es un documento humano, no una tabla limpia: los bloques cambian de
columna entre meses, hay filas vacías en medio y notas sueltas a la derecha. Por
eso `presupuestoSheet.ts` busca los encabezados **por su texto** y lee hacia
abajo hasta el «Total», en vez de leer coordenadas fijas. Así aguanta que un mes
traiga dos gastos más.

El parser está verificado contra las diez pestañas existentes: los totales que
calcula coinciden con los que la propia hoja suma.

### Lo que el parser NO lee, a proposito

Las columnas de la derecha de la hoja traen bloques sueltos sin encabezado con
gastos grandes planeados: «Viaje Enero 31 $65,000», «Viaje Disney y SW
$40,000», «EliteTV», etc.

**No los leas.** Parece un hueco y no lo es. Esas cifras son el costo total del
viaje, y una parte ya esta apartada en los fondos que el parser si registra
(«Saldo de Fondo de emergencia», «Saldo de Fondo de inversion», los apartados
semanales). Sumarlas contaria dos veces el mismo dinero y haria ver deuda donde
hay ahorro. Brandon lo confirmo explicitamente: el comportamiento actual es el
correcto.

### De quién es cada ingreso

Confirmado por Brandon, no es suposición:

- **«Ingreso Mensual (Después de impuestos)»**, la celda B1 — es su nómina.
- **«Ingreso Quincenal Extra»**, el bloque que aparece desde agosto 2026 — es
  **de su pareja**, y ella va a dejar de trabajar pronto. Va excluido por
  defecto (`presupuesto_config.ingresos_excluidos = 'extra'`).
- Brandon además tiene **ingresos propios irregulares** por ventas e IPTV que
  la hoja no registra. Se capturan en `presupuesto_ingresos` y se marcan como
  `variable`, aparte de la nómina: presupuestar gastos fijos contra un ingreso
  que entra a veces es justo como se rompe un presupuesto.

**La hoja es correcta.** Si te llama la atencion que su ingreso ahi sea de
$21–27k cuando su SBC del IMSS es de $37,050: no hay contradiccion. El SBC es
bruto e integrado (incluye aguinaldo, prima y vales prorrateados); la hoja
registra el neto en efectivo. Son cifras distintas y no se comparan.

Otros datos que el confirmo:

- **Abril 2026: aumento de sueldo del 4%.**
- **Vales de despensa: $740 semanales**, que la hoja **no** incluye. Son
  $3,206.67 al mes (740 × 52 ÷ 12), cerca del 13% de su ingreso. Estan
  sembrados en `presupuesto_ingresos` como recurrentes desde enero 2026;
  verifica el mes de inicio con el si importa.
- Hace **tiempo extra**, asi que el ingreso varia hacia arriba.
- **Lo que sobra un mes lo pasa al siguiente.** La pagina lo muestra como
  arrastre, no lo suma al ingreso: hacerlo inflaria los porcentajes contra las
  metas del 55/10/10/10/5.

---

## Deuda conocida

- **RLS apagado** en todas las tablas y la llave anónima va en el paquete
  público. El único freno real es Clerk. La migración está lista y pendiente.
- **Clerk es una instancia de desarrollo** (`pk_test_`) corriendo en producción.
- `CRON_SECRET` no está puesto en Vercel; los crons devuelven 401 en silencio.
- `backend/`, `Dockerfile` y `fly.toml` son de una migración de hosting que
  quedó a medias, y **nada los llama**. Antes de culpar a «el backend» de un
  fallo, revisa `frontend/api/`: ahí están las funciones que sí corren.
- Las funciones de `frontend/api/` importan Clerk con `createClerkClient`. Un
  `import Clerk from '@clerk/backend'` (por defecto) **revienta al cargar el
  módulo** — ese paquete no tiene export por defecto en la versión 1 — y la
  función responde 500 antes de ejecutar una línea.

---

## Sobre Brandon

- **Pregunta antes de concluir**, sobre todo en temas de su carrera, su escuela
  (UNITEC) o sus finanzas. Lo pidió explícitamente después de que una suposición
  mía sobre sus materias resultó equivocada.
- Para comparar ofertas de trabajo: el **porcentaje sobre el paquete anual
  completo** decide, y los **pesos al mes** ordenan la lista. Un porcentaje
  sobre «lo que queda disponible» exagera y engaña.
- Prefiere entender el modelo antes que recibir un número. Vale la pena explicar
  de dónde sale una cifra y qué supuesto la sostiene.
