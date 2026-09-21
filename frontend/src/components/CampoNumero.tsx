import { useEffect, useRef, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Campo numérico que sí se puede vaciar.

   La versión ingenua —  value={valor}  con  onChange={e => onChange(num(...))}
   — hace imposible borrar un cero: al vaciar el campo, num('') devuelve 0, el
   estado no cambia, y React vuelve a pintar el 0 en el acto. Para escribir
   35000 sobre un 0 hay que poner el cursor después y dejar "035000".

   La cura es separar las dos cosas que ahí se confunden: el TEXTO que se está
   escribiendo, que puede estar vacío o a medias ("3", "3.", "-"), y el NÚMERO
   que sale hacia afuera, que siempre es válido. El texto vive aquí dentro; el
   número se emite.

   Estaba copiado en tres lugares — el formulario de vacante, los simuladores
   de PPR e INFONAVIT, y la calculadora de independencia financiera — así que
   vive aquí una sola vez.
   ═══════════════════════════════════════════════════════════════════════════ */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

export function CampoNumero({ label, valor, onChange, sufijo, paso = 1, ayuda, mono = true }: {
  label: string
  valor: number
  onChange: (v: number) => void
  sufijo?: string
  paso?: number
  ayuda?: string
  mono?: boolean
}) {
  const [texto, setTexto] = useState(() => (valor === 0 ? '' : String(valor)))

  // Lo último que emitimos. Distingue un cambio que viene de fuera — abriste
  // otra vacante, se recargaron los datos — de uno que acabamos de causar
  // nosotros. Sin esta marca, el efecto reescribiría el texto mientras escribes.
  const emitido = useRef(valor)

  useEffect(() => {
    if (valor === emitido.current) return
    emitido.current = valor
    setTexto(valor === 0 ? '' : String(valor))
  }, [valor])

  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">
        {label}{sufijo ? ` (${sufijo})` : ''}
      </label>
      <input
        className={`input ${mono ? 'font-mono' : ''}`}
        type="number"
        inputMode="decimal"
        value={texto}
        step={paso}
        placeholder="0"
        onChange={e => {
          const t = e.target.value
          setTexto(t)
          const n = num(t)
          emitido.current = n
          onChange(n)
        }}
      />
      {ayuda && <p className="text-xs text-dim mt-1 leading-snug">{ayuda}</p>}
    </div>
  )
}
