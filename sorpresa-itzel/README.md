# 🪄 Sorpresa para Itzel

Una experiencia interactiva estilo **Mapa del Merodeador** para revelar la cita en el cine.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La sorpresa. Un solo archivo, se abre con doble clic en cualquier navegador o teléfono. No necesita instalar nada. |
| `MENU-MAGICO.md` | Cómo recrear el menú temático de Cinépolis en casa y dónde conseguir cada cosa en Ciudad Juárez. |

## Cómo funciona

1. **El juramento** — el pergamino está en blanco. Ella tiene que escribir
   *"Juro solemnemente que mis intenciones no son buenas"*. Hay pistas si falla.
2. **Las pruebas** — 10 preguntas de Harry Potter. Cada acierto enciende una huella
   en el mapa. Si falla puede volver a intentar; no hay forma de perder.
3. **La revelación** — se abre el boleto con la fecha, hora, cine, sala y asientos,
   más el menú temático.
4. **"Travesura realizada"** — el pergamino se apaga.

## Cómo se lo mando

- **Por WhatsApp o correo:** manda el archivo `index.html` como adjunto. Ella lo abre y listo.
- **En persona:** ábrelo tú en el teléfono o la laptop y pásaselo.

## Cómo edito los datos

Abre `index.html` con cualquier editor de texto y busca el bloque `const CONFIG` (cerca
del final). Ahí están el nombre, la fecha, la hora, el cine, la sala, los asientos y la
dedicatoria. Justo abajo está `PREGUNTAS`: puedes agregar, quitar o cambiar preguntas —
`r` indica cuál es la respuesta correcta (`0` = A, `1` = B, `2` = C).
