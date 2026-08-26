# Registro de decisión — analítica, publicidad y medición de conversiones

**Fecha:** 2026-08-25 · **Estado:** vigente (Fase 1)

Este documento existe para que la decisión se pueda **revisar o cambiar** más
adelante con el contexto completo, sin reconstruir el razonamiento desde cero.
No es una recomendación legal: la decisión final la debe confirmar un abogado.

---

## El problema que se arregló

Hasta el 25 de agosto de 2026, la política de privacidad publicada declaraba el
consentimiento como base legal para la analítica ("Activadas con tu
consentimiento", sección 9.2), pero GA4 y el Meta Pixel se cargaban en el
`<head>` en cada visita, antes de que el banner apareciera. El banner solo
guardaba un flag y no bloqueaba nada; su único botón era "Aceptar".

Lo grave no era la falta de banner —**Perú no tiene una "ley de cookies"** al
estilo europeo que lo exija por sí sola— sino la **contradicción documentada**:
el sitio decía por escrito una cosa y hacía otra. Es atacable por dos vías:

- **INDECOPI (Ley 29571):** no requiere discutir si una cookie es dato personal.
  Basta comparar el texto publicado con el comportamiento real.
- **ANPD (Ley 29733 + DS 016-2024-JUS):** la propia política sirve como
  evidencia de que el estándar aplicable se conocía.

## Estado actual (Fase 1)

| Qué | Base legal | Comportamiento |
|---|---|---|
| **Google Analytics 4** | Consentimiento | Consent Mode v2: arranca en `denied`, mide agregado y sin cookies. Sube a medición completa solo si el visitante acepta. |
| **Meta Pixel** | Consentimiento | No se carga hasta que el visitante acepta. |
| **Conversión propia** (`/api/conversion`) | — (dato anónimo) | Registra siempre el clic a WhatsApp. Sin IP, sin user-agent, sin identificadores. |

## Por qué el píxel está en consentimiento y no en interés legítimo

Se evaluó dejarlo bajo interés legítimo con derecho de oposición —cargándose por
defecto y apagándose solo para quien pulse "Rechazar"— para no perder señal
publicitaria. **Se descartó por ahora, y el motivo importa:**

**Hoy no hay campañas activas.** Sin campañas no hay algoritmo que optimizar, así
que el coste de gatear el píxel (entre un 15% y un 40% de señal de conversión) es
**cero en este momento**. Y a la vez, el interés legítimo estaría en su versión
más débil: justificarse por "medir el rendimiento de nuestra inversión
publicitaria" cuando esa inversión todavía no existe es recoger datos sin un
propósito activo, que es justo lo que el principio de finalidad no tolera bien.

Dicho al revés: **gatearlo hoy es gratis, y desgatearlo será defendible mañana.**
No al contrario.

El único argumento real para dejarlo encendido ya es sembrar públicos para
cuando se lance. Es legítimo, con un matiz: los públicos personalizados de web de
Meta tienen ventana máxima de ~180 días, así que lo recogido hoy solo sirve si se
lanza dentro de unos meses. Además, para un negocio local la palanca más fuerte
suele ser una **lista de clientes** a partir de la base de pacientes, que no
necesita píxel (pero sí su propia base de consentimiento).

## El hueco que se cerró en esta fase

El píxel solo enviaba `PageView`. Los clics a WhatsApp —**la conversión real del
negocio**— iban a GA4 y nunca llegaban a Meta.

Eso significaba que, al encender campañas, Meta no habría tenido ningún evento de
conversión al que optimizar: se habría pagado por tráfico optimizado hacia "gente
que carga una página" en vez de "gente que escribe". Es más determinante para el
rendimiento que todo el debate de consentimiento.

Ahora el clic a WhatsApp dispara tres cosas:

1. `whatsapp_click` en GA4 (ya existía).
2. **`Lead` en Meta** — evento *estándar*, no propio: es el que Meta sabe usar
   para optimizar campañas y construir públicos similares. Solo si hay consentimiento.
3. **Registro en `conversiones` (Supabase)** — siempre, con o sin consentimiento.

### Por qué la conversión propia es anónima a propósito

No se guarda **nada** identificable: ni IP, ni user-agent, ni cookie, ni
identificador de sesión. Solo el evento y su origen de campaña. Por eso no
necesita consentimiento, no entra en la política como dato personal y no genera
obligaciones ARCO. Es también la única fuente de medición que no se cae por
bloqueadores, rechazo de cookies o cambios de política de Google o Meta.

**Si algún día se añade IP, user-agent o cualquier identificador, deja de ser
anónimo y hay que actualizar `/privacidad/` ANTES de desplegarlo.**

---

## Fase 2 — cuando se lancen campañas

Ese es el momento de revisar esta decisión, ya con información real (presupuesto,
volumen, mercados).

1. **Mover el píxel a interés legítimo con oposición**, si el coste de señal lo
   justifica. En `src/layouts/Layout.astro` el arranque dice hoy:
   `if (leerConsentimiento() === 'granted') aplicarConsentimiento();`
   Añadir `if (leerConsentimiento() !== 'denied') cargarMetaPixel();` lo convierte
   en opt-out. **El derecho de oposición no es opcional en ese escenario:** sin
   una vía real de ejercerlo, el interés legítimo se sostiene mucho peor.
2. **Actualizar `/privacidad/` en el MISMO commit** (secciones 2.3, 9.3 y la
   tabla de bases legales) y el texto de `CookieBanner.astro`. Subir versión y
   fecha de la política.
3. **Conversions API de Meta**, para recuperar señal perdida por bloqueadores y
   Safari entre quienes ya consintieron. **No es una vía para saltarse el
   consentimiento:** mandar lo mismo desde el servidor tiene el mismo problema
   legal.
4. **Actualizar el arnés de tests**, que fija el comportamiento actual y fallará
   a propósito. Actualizar las aserciones, no borrarlas.

## Fase 3 — condiciones que obligan a apretar, no a aflojar

Si se cumple cualquiera de estas, el píxel vuelve o se queda en consentimiento
sin discusión:

- Tráfico significativo de la **Unión Europea** (el RGPD no acepta interés
  legítimo para píxeles publicitarios).
- La **ANPD** empieza a sancionar cookies publicitarias en Perú.
- Un **reclamo formal** de un usuario o un competidor.
- El píxel se usa para algo más que medir campañas propias (públicos
  compartidos o vendidos, cruces con terceros).

## La cita que originó este documento

> Si el costo publicitario te preocupa más que el legal, la alternativa honesta
> es la otra salida: revertir a interés legítimo para analítica y reescribir la
> política. Para GA4 puro es un argumento defendible. Para el Meta Pixel con
> fines publicitarios es débil en casi cualquier jurisdicción — ahí el
> consentimiento es difícil de esquivar.

## La regla que no se debe romper

Se puede trackear más o trackear menos. Lo que no se puede es **declarar una cosa
y hacer otra**. Ese era el hallazgo original, y cualquier cambio futuro debe
tocar código y política en el mismo commit.

---

## Tareas manuales pendientes (no son código)

Guía paso a paso con las pantallas concretas: [`docs/setup-medicion.md`](../setup-medicion.md).

- [x] Correr `db/conversiones.sql` en el SQL Editor de Supabase. *(25/08, más la migración `001-utm-content.sql`)*
- [x] **Verificar el dominio** `ajlnutricion.com` en Meta Business Manager. *(25/08, por metaetiqueta en el Layout)*
- [ ] Marcar `whatsapp_click` como **evento clave** en la interfaz de GA4, para
      que cuente como conversión en los informes.
- [ ] Anotar en GA4 la fecha del cambio de medición (25/08/2026): las cifras
      anteriores y posteriores no son comparables.

## Pendiente relacionado

**Google Fonts** se sigue cargando desde `fonts.googleapis.com` sin
consentimiento, lo que transmite la IP del visitante a Google en cada visita. No
es cookie de analítica y está declarado como procesador en la política, pero la
forma limpia de cerrarlo es **auto-hospedar las fuentes** (Fraunces e Inter) en
`public/`. Fuera del alcance acordado.
