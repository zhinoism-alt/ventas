-- Metas de ahorro que ya se pagaron.
--
-- "Total Ahorrado" sumaba el acumulado de TODAS las metas activas, sin
-- distinguir una en curso de una que ya se completo y gasto. Si Brandon
-- ahorro 20,000 para un viaje, lo pago, y esa meta se quedo con
-- acumulado=20000, ese dinero seguia contando como si todavia lo tuviera.
--
-- No es lo mismo que `activo`: apagar `activo` hace que la meta desaparezca
-- por completo (ni se ve en Metas, ni queda historial). `pagada` la saca de
-- los totales de dinero disponible pero la deja visible como logro.

ALTER TABLE ahorros
  ADD COLUMN IF NOT EXISTS pagada BOOLEAN NOT NULL DEFAULT false;
