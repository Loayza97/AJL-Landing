# Dónde quedó el diagrama del ciclo, y cómo seguir

**Última sesión:** 11-sep-2026. Esto es la Tarea B del handoff comercial, el esquema visual del método.

---

## Las versiones (11-sep)

| Archivo | Qué es |
|---|---|
| `ciclo-sesion-plan-seguimiento-v1-base.html/.png` | La base congelada del 10-sep. No se toca |
| `ciclo-sesion-plan-seguimiento-v2.html/.png` | **La viva.** Solo negritas; el detalle es una burbuja (`+`) que se ve en la web al pasar el cursor o tocar. El PNG se genera con `?png=1` (sin `+` ni burbujas) |
| `ciclo-sesion-plan-seguimiento-v3.html/.png` | Prueba: cada sector muestra el objeto (barra de 60 min, celular con el plan, chat de WhatsApp). Quedó en pausa; Joaquín prefirió seguir con oraciones antes de meter imágenes |
| `ciclo-sesion-plan-seguimiento-artefacto.html` | La v2 empaquetada para publicar como Artifact (escala a la ventana). Publicada en https://claude.ai/code/artifact/891809ee-1ac3-44f6-a966-724140118dd9 |
| `ciclo-sesion-plan-seguimiento.html/.png` | Igual a la v1-base; se conserva por compatibilidad |

**Fuente de contenido desde el 11-sep:** `~/Downloads/version_final_de_3_pilares.md` (copy comercial de los 3 pilares). Las viñetas de "Tu plan" en la v2 las dictó Joaquín tal cual; las burbujas salen del documento.

## La pieza viva

`ciclo-sesion-plan-seguimiento-v2.html` es la fuente. Se edita ahí y se regenera el PNG con `?png=1`.

Es un diagrama circular de tres sectores en forma de flecha, con el contenido dentro de cada
sector, insignias numeradas montadas sobre el borde y una esfera central que los conecta.

| | Sector | Color | Posición |
|---|---|---|---|
| 01 | Tu sesión | Terracota `#BE6E42` | Arriba a la izquierda |
| 02 | Tu plan | Verde medio `#2F6E52` | Arriba a la derecha |
| 03 | Tu seguimiento | Verde oscuro `#173C2C` | Abajo |

El 01 arranca arriba a la izquierda a propósito: es donde el ojo entra por defecto. Lleva la
etiqueta "Empieza aquí" con pico apuntando a la insignia.

### Regenerar el PNG

```bash
cd infografias
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=6000 \
  --window-size=1660,1840 \
  --screenshot=ciclo-sesion-plan-seguimiento.png \
  "file://$PWD/ciclo-sesion-plan-seguimiento.html"
```

Si cambias la altura del contenido, ajusta el segundo número de `--window-size`.

---

## De dónde sale cada dato

Nada del texto es inventado. Las fuentes, por orden de peso:

| Fuente | Qué aporta |
|---|---|
| `~/Downloads/Sesion, procesamiento de informacion y generacion del plan.md` | Los 4 momentos de la consulta. **Manda para el sector 01** |
| `~/Downloads/mapa_general_de_consulta.md` | El proceso completo del paciente, de la consulta al plan espejo |
| `~/Documents/ANATOMIA-ENTREGABLE-PACIENTE.md` | Qué ve el paciente en su plan y de dónde sale cada elemento. **Manda para el sector 02** |
| Dictado de Joaquín, 10-sep | Qué contempla el seguimiento. **Manda para el sector 03** |
| `~/Downloads/PACK-KOC/` | El handoff comercial, los planes, precios y el ecosistema |

---

## Decisiones tomadas, para no volver a discutirlas

**Tres pasos y una banda, no cuatro cuadros.** Sesión, plan y seguimiento son secuenciales.
El resto del acompañamiento (clases, grupo) no es un paso, ocurre en paralelo, y por eso va en
la franja verde del pie.

**El ciclo cierra del seguimiento a la sesión**, no al plan. La sesión se repite; por eso el
cuadro se llama "Tu sesión" y no "Tu primera sesión".

**Solo se promete peso y talla.** El resto de mediciones depende del paciente, hay casos en
que la circunferencia no se puede tomar. Prometer más repite el error que corregimos en A1.

**El plan Básico no tiene seguimiento.** Va dicho en el pie, en pequeño, para no prometer de
más a quien compra una sola sesión.

**Nada de jerga.** Ni TMB, ni GET, ni METs, ni antropometría, ni cluster, ni toggle, ni
portada. El brief manda escribir para alfabetización muy baja.

**Sin rayas ni guiones como inciso**, en esta pieza y en todo lo que se escriba para Joaquín.

---

## Lo que quedó abierto

1. **Contraste del terracota.** Blanco sobre `#BE6E42` da una ratio cercana a 3,3 a 1, por
   debajo del mínimo recomendado para texto pequeño, y encima es el sector por el que se
   empieza a leer. Tres salidas: oscurecer ese terracota solo dentro del gráfico, poner el
   texto en verde oscuro en vez de blanco, o dejarlo. **Es decisión de marca.**
2. **El ángulo de las puntas de flecha** está en 9 grados. Deja un escalón pequeño en la unión
   de abajo a la izquierda. Bajarlo a 6 lo suaviza, pero el giro se nota menos.
3. **Formato.** Hoy es casi cuadrado, 1660 × 1800. Volver a A4 apaisado obliga a reducir el
   cuerpo de letra, porque el contenido es el que es.
4. **Dónde se publica.** La pieza todavía no está en el sitio. Falta decidir si va en el home,
   en una página propia tipo `/como-funciona`, o solo como imagen para WhatsApp.
5. **Versión vertical para WhatsApp.** La hoja actual se lee bien en escritorio. Para el chat
   conviene una versión más alta y estrecha, o partir el PNG en dos.

---

## `descartados/`

Lo que se probó y no quedó. Se guarda porque el criterio de por qué no funcionó es útil.

| Pieza | Por qué se descartó |
|---|---|
| `1-dos-cajas` a `5-no-es-si-es` | Cinco enfoques de la cita y el plan. Se quedaron cortos: superficiales y de un solo tipo de paciente |
| `6-no-somos-iguales` | La adaptación como argumento. Buena idea, no era lo que pedía el encargo |
| `cadena-larga` | La cadena completa en vertical, 4 veces más alta que ancha. Correcta pero no cabía en una hoja |
| `cadena-p1` y `p2` | La misma, partida en dos para WhatsApp |

La infografía del **ciclo dialéctico** (`ciclo-del-metodo`) es otra pieza distinta y sigue
viva: cuenta el método como espiral que asciende hasta la graduación. Ver el `README.md`.
