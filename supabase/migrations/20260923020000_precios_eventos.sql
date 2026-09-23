-- Precios reales, confirmados por Brandon: consulta $800, Mounjaro $3,590.
UPDATE calendario_eventos
SET monto = 800.00
WHERE titulo LIKE '%Nutriólogo%';

UPDATE calendario_eventos
SET titulo  = '💉 Dosis Mounjaro (2.5mg) — Itzel',
    detalle = 'Aplicar la dosis semanal. La siguiente dosis ronda los $3,590 -- revisa si toca comprarla.'
WHERE titulo LIKE '%GLP-1%';
