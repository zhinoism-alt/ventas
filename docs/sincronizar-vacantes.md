# Mandar vacantes a VentasPro desde la búsqueda diaria

La tarea diaria escribe directo en Supabase. No hay backend de por medio: es la
misma tabla que lee la pestaña **Empleo**, así que lo que mande aparece en el
tablero en cuanto recargues.

## Antes de buscar: leer qué ya está registrado

La tarea tenía una lista de «empresas ya aplicadas» escrita a mano dentro del
prompt. Cada rechazo obligaba a editar el prompt, y eso se desincronizaba de
VentasPro, que es donde esa información ya vive.

Ahora la lee:

```
GET  .../rest/v1/empleo_vacantes?select=empresa,puesto,estado,link&activo=eq.true
```

Omite las vacantes cuyo enlace ya aparezca. Si la empresa está pero con otro
puesto, sí se lista, aclarándolo.

## El llamado

```
POST  https://<TU-PROYECTO>.supabase.co/rest/v1/empleo_vacantes?on_conflict=link_norm
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
Prefer: resolution=ignore-duplicates
```

El cuerpo es un arreglo, así que **un solo llamado manda todas las del día**:

```json
[
  {
    "empresa":  "Nombre de la empresa",
    "puesto":   "Título de la vacante",
    "link":     "https://...",
    "fuente":   "LinkedIn",
    "ciudad":   "Ciudad Juárez",
    "modalidad": "remoto",
    "sueldo_min": 0,
    "sueldo_max": 0,
    "moneda":   "MXN",
    "resumen":  "Dos o tres líneas de qué pide el anuncio.",
    "origen":   "auto",
    "revisada": false
  }
]
```

Solo `empresa` y `puesto` son obligatorios. Todo lo demás tiene valor por
defecto.

## Las tres cosas que no hay que cambiar

**`origen: "auto"`** separa lo que trajo el robot de lo que capturaste tú. Sin
esa marca, el tablero deja de ser tuyo.

**`revisada: false`** hace que entren a la banda de «vacantes que encontró tu
búsqueda diaria» en vez de a tus números. Una vacante que todavía no lees no
debe mover tu promedio de sueldo ni tu mejor oferta.

**`on_conflict=link_norm` con `Prefer: resolution=ignore-duplicates`** es lo
que evita que el tablero se llene de copias. La misma vacante aparece hoy,
mañana y pasado; con esto, la segunda vez no hace nada.

`link_norm` es una columna generada: Postgres normaliza el enlace a minúsculas
y sin diagonal final. Manda el enlace tal como lo encuentres — ya se probó que
`https://Ejemplo.test/x/` y `https://ejemplo.test/x` terminan siendo la misma
fila.

## Campos que conviene llenar si el anuncio los trae

| Campo | Para qué sirve |
|---|---|
| `sueldo_min`, `sueldo_max` | Sin esto la comparación contra tu sueldo actual no corre |
| `modalidad` | `remoto`, `hibrido` o `presencial` |
| `dias_oficina` | Con `hibrido`, cuántos días vas |
| `ciudad` | Decide si implica mudarte |
| `vales_mensual`, `bono_anual` | Entran al paquete anual, que es lo que decide |
| `requisitos` | Separado por comas |

Lo que no venga en el anuncio, déjalo fuera: un cero inventado es peor que un
hueco, porque se ve igual que un dato.

## Sobre la llave

La `anon key` ya viaja en el paquete público de la aplicación, así que usarla
aquí no expone nada nuevo. Lo que sí importa: **no uses la `service_role`**.
Esa sí tiene permiso total sobre la base y no tiene por qué salir de tu
máquina.
