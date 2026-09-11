# Infografías

**Si retomas esto sin contexto, empieza por `RETOMAR-AQUI.md`.**

Piezas visuales que **no** se publican en el sitio. Astro solo compila `src/` y copia
`public/`, así que esta carpeta queda versionada pero fuera del deploy.

## `ciclo-sesion-plan-seguimiento`

La pieza principal: el ciclo del servicio en un diagrama circular de tres sectores, sesión,
plan y seguimiento. Es la Tarea B del handoff comercial. Todo el contexto, las fuentes y lo
que queda abierto está en `RETOMAR-AQUI.md`.

| Archivo | Para qué |
|---|---|
| `ciclo-sesion-plan-seguimiento.html` | La fuente. Se edita acá |
| `ciclo-sesion-plan-seguimiento.png` | 3320×3680, para compartir o imprimir |

## `ciclo-del-metodo`

El ciclo del método AJL contado como una espiral: cada vuelta cierra más arriba que la
anterior y el acompañamiento decrece hasta la graduación.

| Archivo | Para qué |
|---|---|
| `ciclo-del-metodo.html` | La fuente. Se edita acá |
| `ciclo-del-metodo.png` | 2560×2580, para compartir por WhatsApp o meter en una presentación |

**La estructura es dialéctica**, aunque la palabra no aparece nunca en pantalla: cada vuelta
son tres momentos, y el color los distingue sin nombrarlos.

- **Blanco**, "tú traes": tu vida de hoy
- **Terracota**, "nosotros ponemos": el plan
- **Verde oscuro**, "sale de los dos": lo que sí funcionó, que se vuelve el punto de
  partida de la vuelta siguiente

La última vuelta cierra en terracota sólido, el único bloque del color de acento, porque es
el destino: la graduación.

**Por qué espiral y no círculo:** el manual describe el dolor del paciente como *"el ciclo de
fracaso"* (`40-MANUAL-TEORICO.md` §2.2). Un círculo cerrado dibuja exactamente eso, girar sin
avanzar. La espiral dice lo contrario.

## Regenerar el PNG

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=6000 \
  --window-size=1280,1290 \
  --screenshot=ciclo-del-metodo.png \
  "file://$PWD/ciclo-del-metodo.html"
```

Si cambias el alto del contenido, ajusta el segundo número de `--window-size` o la imagen
saldrá recortada o con relleno de más.

## Relación con la sección del sitio

Esta infografía es **la versión larga**. La sección publicada en el home es una reducción
deliberada a 3 pasos, pensada para consumirse de un vistazo y con la mínima fricción. Las dos
cuentan el mismo ciclo; si cambia el método, hay que actualizar ambas.
