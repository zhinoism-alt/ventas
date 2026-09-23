-- Eventos generales del calendario compartido: dosis, citas, lo que sea que
-- no sea comida ni limpieza. Se alimentan al mismo feed .ics que
-- dietas_comidas y limpieza_tareas.

CREATE TABLE IF NOT EXISTS calendario_eventos (
  id          SERIAL PRIMARY KEY,
  titulo      TEXT NOT NULL,
  detalle     TEXT,
  -- Para 'ninguna': la fecha exacta del evento. Para 'semanal': cualquier
  -- fecha que caiga en el dia de la semana que se repite (se usa solo para
  -- calcular ese dia, no queda fija).
  fecha       DATE NOT NULL,
  hora        TIME NOT NULL DEFAULT '09:00',
  recurrencia TEXT NOT NULL DEFAULT 'ninguna' CHECK (recurrencia IN ('ninguna', 'semanal')),
  monto       NUMERIC(10,2),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calendario_eventos DISABLE ROW LEVEL SECURITY;

-- Dosis semanal de GLP-1 de Itzel, domingos 9am. El monto se deja vacio
-- porque cambia segun donde la compren -- se llena desde la app.
INSERT INTO calendario_eventos (titulo, detalle, fecha, hora, recurrencia)
VALUES (
  '💉 Dosis GLP-1 (2.5mg) — Itzel',
  'Aplicar la dosis semanal. Si no tienes la siguiente a la mano, es buen momento para comprarla.',
  -- cualquier domingo sirve como ancla; el feed calcula el proximo
  (CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7))::date,
  '09:00',
  'semanal'
);

-- Cita con el nutriologo, unica vez. Precio pendiente -- Brandon lo llena.
INSERT INTO calendario_eventos (titulo, detalle, fecha, hora, recurrencia, monto)
VALUES (
  '🩺 Nutriólogo — Dra. Ochoa (Itzel)',
  'Cita de seguimiento.',
  '2026-10-10',
  '09:00',
  'ninguna',
  NULL
);
