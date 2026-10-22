# Puesta en marcha de la medición — guía paso a paso

Cuatro tareas manuales que quedaron pendientes tras el commit `293069d`. Ninguna
es código: son clics en Supabase, Meta y GA4.

**Solo la primera es urgente.** Sin ella se está perdiendo información cada día.
Las otras tres pueden esperar, pero la 2 conviene hacerla pronto porque depende
de terceros.

| # | Tarea | Dónde | Tiempo | Urgencia |
|---|---|---|---|---|
| 1 | Crear la tabla `conversiones` | Supabase | 5 min | ~~Bloqueante~~ **Hecho 25/08** |
| 2 | Verificar el dominio | Meta Business Manager | ~10 min | ~~Pendiente~~ **Hecho 25/08** |
| 3 | Marcar `whatsapp_click` como evento clave | GA4 | 3 min | Cuando haya datos |
| 4 | Anotar la fecha del corte | GA4 | 2 min | Cuando puedas |

---

## 1. Crear la tabla `conversiones` en Supabase

**Por qué importa.** El sitio ya está enviando cada clic a WhatsApp a
`/api/conversion`. Como la tabla no existe todavía, el endpoint responde 500 y
**ese dato se pierde**. No se acumula en ninguna parte esperando: se descarta.
Cada día que pase son consultas de clientes que no quedan registradas.

**Pasos**

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) y abre el
   proyecto **"Alejandro el máximo Techie"**.
   Es el mismo que ya tiene `reclamos` y `newsletter_subscribers`. No crees uno
   nuevo: el endpoint usa las variables `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`
   que ya están configuradas en Vercel y apuntan a ese proyecto.
2. En el menú lateral, abre **SQL Editor**.
3. Pulsa **New query**.
4. Copia y pega este bloque. Es el contenido de `db/conversiones.sql` sin los
   comentarios: esos documentan la decisión para quien lea el código, pero no
   hacen nada al ejecutarse.

   ```sql
   CREATE TABLE IF NOT EXISTS conversiones (
     id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     evento       TEXT NOT NULL CHECK (evento IN ('whatsapp_click')),
     seccion      TEXT,
     paquete      TEXT,
     utm_source   TEXT,
     utm_medium   TEXT,
     utm_campaign TEXT,
     path         TEXT,
     creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_conv_creado   ON conversiones (creado_en DESC);
   CREATE INDEX IF NOT EXISTS idx_conv_campania ON conversiones (utm_campaign, creado_en DESC);

   ALTER TABLE conversiones ENABLE ROW LEVEL SECURITY;
   ```

5. Pulsa **Run** (o `Cmd + Enter`).

Debe responder `Success. No rows returned`. Eso es correcto: el script crea una
tabla, no devuelve filas.

> **Cuidado:** este proyecto de Supabase está compartido con el sistema interno
> de nutrición (tablas `meal_plan_*`, `nutricionista`, `patient`…). Ejecuta solo
> este script y no toques otras tablas.

> **Si sale el aviso "Snippets no longer save automatically":** ignóralo y pulsa
> *Understood*. Guardar el snippet es distinto de ejecutar el SQL — `Run` corre
> contra la base de datos, guardar solo conserva el texto en la barra lateral. No
> hace falta guardarlo: la copia buena está en el repo.

> **Si el Run falla o se queda colgado:** mira https://status.supabase.com antes
> de asumir que hiciste algo mal. El script es idempotente (`IF NOT EXISTS`), así
> que puedes reintentarlo entero sin duplicar nada.

**Cómo comprobar que funcionó**

1. Ve a **Table Editor** en el menú lateral. Debe aparecer `conversiones` en la
   lista, vacía.
2. Abre [www.ajlnutricion.com](https://www.ajlnutricion.com) y pulsa cualquier
   botón de WhatsApp.
3. Vuelve al **SQL Editor** y ejecuta:

   ```sql
   SELECT * FROM conversiones ORDER BY creado_en DESC LIMIT 10;
   ```

   Debe aparecer una fila con `evento = whatsapp_click` y la sección del botón
   que pulsaste.

**Si no aparece nada.** Entra a Vercel → proyecto → **Logs**, filtra por
`/api/conversion` y mira el error. Lo más probable es que el script no llegara a
ejecutarse entero.

**Consultas que vas a querer después** (están también dentro del `.sql`):

```sql
-- Conversiones por campaña, últimos 30 días
SELECT COALESCE(utm_campaign, '(directo)') AS campania, COUNT(*)
FROM conversiones
WHERE creado_en > NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Qué paquete genera más consultas
SELECT COALESCE(paquete, '(genérico)') AS paquete, COUNT(*)
FROM conversiones GROUP BY 1 ORDER BY 2 DESC;
```

---

## 2. Verificar el dominio en Meta Business Manager

> **Hecho el 2026-08-25** por metaetiqueta. El dominio figura como *Verificado*
> en Business Settings → Dominios. Se deja el procedimiento por si hay que
> rehacerlo (cambio de dominio, portafolio nuevo, o si la verificación se cae).

**Por qué importa.** Verificar el dominio le demuestra a Meta que
`ajlnutricion.com` es tuyo. Sin eso, al anunciar no puedes decidir qué eventos
tienen prioridad para los usuarios de iOS, y Meta puede limitar cómo se atribuyen
tus conversiones.

**Se usó la metaetiqueta, no el DNS.** La etiqueta se verifica en cuanto la
página está desplegada; el registro TXT depende de propagación y puede tardar
horas. La etiqueta vive en `src/layouts/Layout.astro`, dentro del `<head>`
renderizado en el servidor — Meta **rechaza** la verificación si la inyecta
JavaScript, y lo advierte en su propia pantalla.

**Pasos**

1. Ve directo a `https://business.facebook.com/settings/owned-domains`.
   Es mucho más fiable que navegar el menú: Meta lo reorganiza a menudo, y desde
   Business Suite (la vista de la página) no se llega de forma evidente.
2. **Añadir** → escribe `ajlnutricion.com`, sin `www` y sin `https://`.
   Se verifica el dominio raíz y eso cubre el `www`.
3. En **Selecciona una opción**, elige *Añadir una metaetiqueta*.
4. Copia el valor de `content="..."` y pídele a Claude que lo ponga en el
   `<head>` del Layout. Es un commit de una línea; el deploy tarda ~45 s.
5. Comprueba que está servida antes de verificar:

   ```bash
   curl -sSL -A "facebookexternalhit/1.1" https://ajlnutricion.com/ | grep facebook-domain-verification
   ```

   Ese user-agent es el rastreador real de Meta. Si la etiqueta sale aquí, el
   lado del sitio está bien y cualquier fallo posterior es de su interfaz.
6. **Baja hasta el final de los pasos y pulsa el botón «Verificar dominio» del
   paso 4.** Este es el que cuesta encontrar: arriba de la pantalla hay un
   enlace con el mismo nombre que **no** es el botón. Un solo clic, sin
   seleccionar el texto (si lo seleccionas sale el globo de *Preguntar a Meta AI*
   y no pasa nada).

> **No borres la metaetiqueta.** Si desaparece del `<head>`, la verificación
> puede caerse y con ella la configuración de prioridad de eventos. Está
> comentada en el código con esa advertencia. No es un secreto: se sirve en el
> HTML público de todas las páginas.

> **Si algún día falla:** Meta dice que puede tardar hasta 72 h en encontrar la
> etiqueta. Antes de cambiar de método, recarga la pantalla y reintenta — suele
> cachear el resultado del intento anterior. Cambiar a DNS no arregla un problema
> de interfaz y es más lento.

---

## 3. Marcar `whatsapp_click` como evento clave en GA4

**Por qué importa.** GA4 ya recibe el evento, pero lo trata como uno más entre
docenas. Marcarlo como *evento clave* hace que aparezca como conversión en los
informes, que puedas comparar campañas por conversiones en vez de por sesiones,
y que las tasas de conversión se calculen solas.

**Antes de empezar:** el evento tiene que haberse registrado al menos una vez, y
GA4 tarda **hasta 24 horas** en mostrar eventos nuevos en esta pantalla. Si
acabas de desplegar, espera al día siguiente.

**Pasos**

1. Entra a [analytics.google.com](https://analytics.google.com) y elige la
   propiedad de AJL (measurement ID `G-SQ5K6KFXT3`).
2. Abajo a la izquierda, pulsa **Administrar** (el engranaje).
3. En la columna de propiedad, ve a **Visualización de datos** → **Eventos**.
4. Busca `whatsapp_click` en la lista.
5. Activa el interruptor **Marcar como evento clave**.

> Google renombró "conversiones" a "eventos clave" en 2024. Si tu interfaz aún
> dice "Conversiones", es lo mismo: el interruptor se llamará *Marcar como
> conversión*.

**Marca también `whatsapp_click_floating`**, que es el botón flotante. Son dos
eventos distintos a propósito, para poder comparar qué CTA convierte mejor.

**Si el evento no aparece.** Comprueba primero que se está registrando:
**Informes** → **Tiempo real**, abre el sitio en otra pestaña, acepta las
cookies y pulsa un botón de WhatsApp. Debe aparecer en unos segundos. Si no
aparece, revisa que aceptaste las cookies — sin consentimiento GA4 mide en modo
agregado y los eventos individuales no se ven en tiempo real.

---

## 4. Anotar la fecha del corte en GA4

**Por qué importa.** Desde el 25 de agosto de 2026 la medición cambió: GA4 ya no
usa cookies hasta que el visitante acepta. **Las cifras de antes y después no son
comparables.** Sin una nota, dentro de seis meses alguien va a mirar la gráfica,
ver una caída y pensar que el tráfico se desplomó. No se desplomó: cambió cómo se
cuenta.

**Pasos**

1. En GA4, ve a **Administrar** → **Visualización de datos** → **Anotaciones**.
2. Pulsa **Crear anotación**.
3. Rellena:
   - **Título:** `Consentimiento de cookies + Consent Mode v2`
   - **Fecha:** 25 de agosto de 2026
   - **Descripción:** `GA4 pasa a Consent Mode v2 (sin cookies hasta aceptar) y el Meta Pixel deja de cargarse sin consentimiento. Las cifras anteriores no son comparables: parte del tráfico pasa a medirse de forma modelada.`
4. Guarda.

> Las anotaciones se desplegaron por fases y puede que tu propiedad todavía no
> las tenga. Si no encuentras el menú, sirve igual dejar la nota en un sitio que
> vayas a mirar: este mismo archivo, o el nombre de la propiedad. Lo importante
> es que la explicación exista en algún lugar findable, no dónde vive.

---

## Cuando termines

Marca las casillas en `docs/legal/decision-consentimiento-cookies.md`, en la
sección "Tareas manuales pendientes", para que quede constancia de qué se hizo y
qué no.
