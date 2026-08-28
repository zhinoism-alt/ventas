# 🪄 Sorpresa para Itzel

Una experiencia interactiva estilo **Mapa del Merodeador** para revelar la cita en el cine.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La sorpresa. Un solo archivo, se abre con doble clic en cualquier navegador o teléfono. No necesita instalar nada. |
| `MENU-MAGICO.pdf` | La guía del menú en PDF, con portada y todo — lista para imprimir o mandar. |
| `MENU-MAGICO.md` | La misma guía en texto plano. |
| `MENU-MAGICO.print.html` | El diseño del PDF. Edítalo y regenera el PDF con el comando de abajo. |

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

## Versión en línea (link para WhatsApp)

`artifact.html` es la misma experiencia publicada como página web, para poder mandarle
un link en vez de un archivo:

**https://claude.ai/code/artifact/b57dd087-c815-45d0-ad55-862669403076**

El link empieza **privado**: hay que compartirlo desde el menú de la página para que ella
pueda abrirlo. Si editas `index.html`, corre este comando para regenerar la versión web:

```
python3 - <<'EOF'
import io,re
s=io.open('sorpresa-itzel/index.html',encoding='utf-8').read()
head=re.search(r'<head>(.*?)</head>', s, re.S).group(1)
body=re.search(r'<body>(.*?)</body>', s, re.S).group(1)
out=("<title>El Mapa del Merodeador</title>\n"
     + "\n".join(re.findall(r'<link[^>]*>', head)) + "\n"
     + re.search(r'<style>.*?</style>', head, re.S).group(0) + "\n"
     + body.strip() + "\n")
io.open('sorpresa-itzel/artifact.html','w',encoding='utf-8').write(out)
EOF
```

## Cómo regenero el PDF

```
chromium --headless --no-pdf-header-footer \
  --print-to-pdf=sorpresa-itzel/MENU-MAGICO.pdf \
  sorpresa-itzel/MENU-MAGICO.print.html
```
