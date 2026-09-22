# Esquema de la base — VentasPro

31 tablas en `public`, agrupadas por lo que hacen. Levantado del esquema real
en producción, no de las migraciones.

## El hallazgo que importa

**No hay ni una sola llave foránea.** Las 31 tablas están sueltas. `ahorros_movimientos.ahorro_id` apunta a `ahorros.id` de palabra, no de hecho: si
borras una meta, sus movimientos se quedan huérfanos y nadie se entera.

Eso no es un descuido menor, pero tampoco es urgente en un tablero de una sola
persona. Es deuda que cobra intereses el día que dos cosas tengan que cuadrar.

---

## Negocio

```mermaid
erDiagram
    products ||--o{ sales : "se vende en"
    iptv_clients ||--o{ iptv_subscriptions : "contrata"
    iptv_packages ||--o{ iptv_subscriptions : "consume creditos de"

    products { bigint id PK "18 cols" }
    sales { bigint id PK "11 cols · product_id sin FK" }
    iptv_clients { bigint id PK "8 cols" }
    iptv_packages { bigint id PK "10 cols" }
    iptv_subscriptions { bigint id PK "20 cols · client_id, package_id sin FK" }
```

## Dinero

```mermaid
erDiagram
    fondos_ahorro ||--o{ fondos_movimientos : "registra"
    ahorros ||--o{ ahorros_movimientos : "registra"
    presupuesto_config ||--o{ presupuesto_meses : "sincroniza"

    finanzas_perfil { bigint id PK "53 cols · ISR, UDI, PPR, AFORE, INFONAVIT" }
    ahorros_cuentas { bigint id PK "12 cols · bancos y SOFIPOs" }
    fondos_ahorro { bigint id PK "11 cols" }
    fondos_movimientos { bigint id PK "7 cols · fondo_id sin FK" }
    ahorros { bigint id PK "12 cols · metas" }
    ahorros_movimientos { bigint id PK "7 cols · ahorro_id sin FK" }
    presupuesto_config { bigint id PK "9 cols · enlace de la hoja" }
    presupuesto_meses { bigint id PK "13 cols · jsonb por mes" }
    presupuesto_ingresos { bigint id PK "11 cols · vales, ventas" }
    udi_historico { smallint anio PK "3 cols" }
```

`finanzas_perfil` con 53 columnas es una tabla-cajón: mete supuestos fiscales,
el PPR, la AFORE y el INFONAVIT en una sola fila. Funciona porque solo hay un
usuario, pero es lo primero que se rompería con dos.

## Carrera

```mermaid
erDiagram
    empleo_perfil { bigint id PK "35 cols · sueldo y prestaciones actuales" }
    empleo_vacantes { bigint id PK "41 cols · origen, revisada, link_norm" }
    empleo_certificaciones { bigint id PK "14 cols" }
    empleo_materias { smallint numero PK "8 cols · UNITEC, con seriacion" }
```

## Vida

```mermaid
erDiagram
    habitos ||--o{ habitos_registros : "se marca en"

    habitos { bigint id PK "10 cols" }
    habitos_registros { bigint id PK "6 cols · habito_id sin FK" }
    recordatorios { bigint id PK "10 cols" }
    mudanza_tareas { bigint id PK "13 cols" }
    mudanza_presupuesto { bigint id PK "9 cols" }
    pareja_gastos { bigint id PK "12 cols" }
    pareja_metas { bigint id PK "7 cols" }
```

## Infraestructura

`exchange_rates`, `pdf_reportes` (la única con `user_id` de Clerk).

---

## Tablas muertas

Existen y nadie las consulta. Se dejan porque borrar datos no se hace sin
preguntar, pero no son parte del sistema:

- **`presupuesto`** — quedó de antes de que Presupuesto leyera la hoja de Google.
- **`sheets_config`** — resto del Sheets Sync que nunca se terminó.

## Tablas fantasma

El código las pide y no existen. Es lo que rompe **Sheets Sync**:

- `sheets_sync_config` — la base tiene `sheets_config`, con otro nombre.
- `sheets_cache`
- `sheets_write_queue`

Las edge functions `sync-sheets` y `write-to-sheet` están en el repo pero **no
desplegadas** (responden 404). Nunca corrió esa cadena completa.

---

## Sobre `user_id` y Clerk

Solo `pdf_reportes` guarda el `user_id` de Clerk. Las otras 30 tablas asumen un
único usuario.

No es un error mientras el tablero sea de una persona. Se vuelve uno el día que
entre alguien más — y ese mismo día importa más el **RLS**, que hoy está apagado
en todas las tablas con la llave anónima viajando en el paquete público.

Orden correcto si alguna vez se comparte: primero `user_id` en todas, luego RLS,
y solo entonces invitar a alguien.
