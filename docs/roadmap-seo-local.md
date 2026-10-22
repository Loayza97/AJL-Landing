# Roadmap SEO local · AJL Nutrición

**Punto de partida (agosto 2026):** ficha de Google verificada con **8 reseñas**, landing de una sola página en producción, Search Console verificado.

**Competencia medida en "nutricionista lima" (pestaña Places):**

| Competidor | Reseñas | Cómo está ganando |
|---|---|---|
| Nutrición con Carolina | 203 ★5.0 | Volumen de reseñas puro |
| Alessandra Canale | 27 ★4.9 | **Anuncio pagado** + reseñas |
| Nutricionista en Lima (Lince) | 16 ★5.0 | Reseñas + está en tu mismo distrito |
| **AJL Nutrición** | **8** | — |

---

## La tesis: no los superas de frente

Google ordena resultados locales por tres cosas: **relevancia**, **distancia** y **prominencia**. Las clínicas grandes te ganan en prominencia (antigüedad, volumen de reseñas, menciones). No hay atajo para empatarles ahí en el corto plazo.

Pero la distancia es la variable que ellos no controlan y tú sí. La búsqueda "nutricionista lima" no devuelve el mismo resultado para todo el mundo: devuelve lo cercano a quien busca. Un consultorio en Lince con 50 reseñas le gana a una clínica en Surco con 200 **para quien busca desde Lince, Jesús María, La Victoria o Santa Beatriz**.

De ahí las dos reglas del plan:

1. **Gana un radio antes de intentar ganar la ciudad.** Domina Lince y los distritos que lo tocan. "Nutricionista lima" a escala de toda Lima es objetivo de 18+ meses; el paquete local de Lince es objetivo de 6.
2. **Compite donde las clínicas no juegan.** Ellas no publican precios, no responden preguntas incómodas y no tienen voz. Tú sí. Eso es terreno libre.

---

## Fase 0 · Higiene técnica (semana 1) — casi terminada

- [x] Coordenadas del schema corregidas (apuntaban a Av. César Vallejo, ~1.1 km del consultorio)
- [x] NAP unificado en una sola fuente (`src/data/contacto.js`) para que web y schema no puedan divergir
- [x] Horarios consistentes entre página visible y schema
- [x] Páginas de servicio (`/newsletter/*`) marcadas `noindex`
- [x] `/demos/` bloqueado en robots.txt, `/privacidad/` agregado al sitemap
- [ ] **Elegir dominio canónico.** Hoy `ajlnutricion.com` redirige a `www.` pero todo el código (canonical, sitemap, robots) declara el apex. Vercel → Settings → Domains → marcar `ajlnutricion.com` como Primary.
- [ ] **Search Console:** enviar sitemap y revisar "Páginas" → cuántas indexadas vs descubiertas.
- [ ] **Confirmar que los horarios del código coinciden con los de la ficha de Google.** Hoy el código dice L-V 10:00–20:00 y Sáb 09:00–19:00.
- [ ] **Confirmar si la dirección es "Av." o "Jr." Almirante Manuel Villavicencio** — OpenStreetMap la registra como Jirón. Debe escribirse igual en la web y en la ficha.

---

## Fase 1 · La ficha es el producto (meses 1–2)

Esta fase es la que mueve la aguja en la pestaña que te preocupa. **La web no compite ahí: la ficha sí.**

### Reseñas: de 8 a 50

El objetivo real es **+7 reseñas al mes**. A 6 meses son ~50, que en Lince te pone por encima de todos menos Carolina.

Lo que hace que esto funcione o fracase es el **momento de la petición**. No pedirla al cerrar el paquete: pedirla el día que el paciente reporta un logro concreto (bajó la talla, aguantó una cena de trabajo sin descarrilar, dejó de tener antojos nocturnos). Ese es el pico emocional.

Sistema concreto:

1. Genera el **link corto de reseña** desde la ficha (`g.page/r/…`) — abre el formulario directo, sin fricción.
2. **Plantilla de WhatsApp** enviada 2–24 h después de una consulta de seguimiento con buen resultado. Personalizada, mencionando el logro puntual.
3. **QR impreso** en el consultorio, sobre el escritorio, no en la pared.
4. **Responde todas**, incluidas las de 5★, en menos de 48 h. La actividad de respuesta es señal de ficha viva.
5. Nunca ofrezcas descuento a cambio de reseña: viola las políticas de Google y arriesga la ficha entera.

### La ficha como landing paralela

- **Categoría primaria: "Nutricionista"**. Secundarias: Dietista, Consultorio médico.
- **20+ fotos**: fachada (ayuda a que te encuentren físicamente), interior, tú en consulta, el equipo de bioimpedancia. Sube 2–3 nuevas al mes.
- **Servicios cargados uno por uno** con descripción de 200–300 caracteres cada uno. Ese texto es indexable dentro de la ficha y casi nadie lo llena.
- **Google Posts semanales**. Un consejo, un caso, una promo. Cuestan 10 minutos y son señal de frescura.
- **Q&A sembrado**: publica tú mismo 8–10 preguntas reales de pacientes y respóndelas. Puedes hacerlo desde otra cuenta.
- **Atributos**: "atención en línea", "se requiere cita", accesibilidad si aplica.

### Métrica de la fase
En Google Business Profile → Rendimiento: **búsquedas de descubrimiento** (gente que no te buscaba por nombre y te encontró). Es el número que dice si estás entrando al paquete local.

---

## Fase 2 · Contenido que las clínicas no publican (meses 2–4)

Hoy tienes un one-pager. Un one-pager compite por tu marca, no por categorías. Necesitas páginas con intención propia.

**Prioridad 1 — la página de precios.** Las clínicas grandes esconden precios detrás de un formulario. "Cuánto cuesta un nutricionista en Lima" tiene volumen real y ellos lo ceden. Tú ya tienes S/80 de evaluación y paquetes hasta S/600: publícalos en una URL propia, `/precios/`, con la tabla completa y el porqué de cada nivel.

**Prioridad 2 — páginas por servicio con contenido real.** `/nutricionista-lince/`, `/bajar-de-peso-sin-dieta/`, `/nutricion-deportiva/`. Aviso: si son la misma página con la palabra cambiada, Google las trata como doorway pages y te penaliza. Cada una necesita su propio caso, su propia FAQ, su propio ángulo.

**Prioridad 3 — long tail conversacional.** Las clínicas escriben "importancia de una alimentación balanceada". Tú escribes lo que la gente realmente tipea:
- "puedo bajar de peso comiendo fuera todos los días"
- "nutricionista que no me quite el pan"
- "cuántas sesiones necesito con un nutricionista"
- "nutricionista por whatsapp perú"

Dos posts al mes, escritos en tu voz de marca. Ocho artículos en cuatro meses cambian el perfil del dominio.

**Prioridad 4 — casos reales.** Con el disclaimer de resultados que ya tienes en el footer, y con consentimiento firmado. Es lo único que ninguna clínica puede copiar: son tus pacientes.

---

## Fase 3 · Citations y autoridad local (meses 3–6)

**NAP idéntico** — mismo nombre, misma dirección carácter por carácter, mismo teléfono — en:

- Doctoralia Perú (**el más importante**: ya rankea para "nutricionista lince" y captura búsquedas donde tu web no llega)
- Bing Places y Apple Business Connect (nadie los trabaja en Perú; son gratis)
- Facebook e Instagram Business
- Directorio del Colegio de Nutricionistas del Perú
- Waze, Foursquare, Páginas Amarillas Perú

**Enlaces locales reales**, en orden de facilidad: gimnasios y boxes de CrossFit de Lince y Jesús María, consultorios médicos vecinos que derivan pacientes, colegios profesionales, notas en medios distritales. Diez enlaces locales genuinos valen más que cien de directorios basura.

---

## Fase 4 · Lo que no pueden copiar (mes 4 en adelante)

Tu ventaja estructural sobre una clínica es que **tú eres una persona y ellas son una marca**. Instagram y TikTok no rankean en Google directamente, pero generan **búsquedas de marca** — gente tipeando "AJL Nutrición" en Google. Ese volumen es una de las señales de prominencia local más fuertes que existen, y es exactamente la que una clínica sin cara no puede fabricar.

El contenido social no es un canal separado del SEO: es el motor de la señal que decide el paquete local.

---

## El atajo pagado

Alessandra Canale está arriba porque **paga**. Mientras el orgánico madura (meses 1–6), Google Ads con segmentación de radio de 5 km alrededor de Lince es la forma de aparecer en esa pantalla desde el primer día. Con ticket de S/80 la evaluación y paquetes de hasta S/600, el CAC aguanta.

Trátalo como puente, no como estrategia: el día que cortas la inversión, desapareces.

---

## Calendario y KPIs

| Mes | Foco | KPI |
|---|---|---|
| 1 | Higiene técnica + sistema de reseñas | 15 reseñas · sitemap indexado |
| 2 | Ficha completa (fotos, servicios, posts, Q&A) | 22 reseñas · descubrimiento +30% |
| 3 | Página de precios + 2 posts | 30 reseñas · top 10 en "nutricionista lince" |
| 4 | Páginas por servicio + citations | 37 reseñas · top 5 en "nutricionista lince" |
| 5 | Enlaces locales + 4 posts acumulados | 45 reseñas · aparecer en el pack local desde Lince |
| 6 | Consolidación | **50+ reseñas · pack local en Lince y colindantes** |

**Expectativa honesta de plazos:**

- **Pack local en Lince y distritos vecinos: 6 meses.** Alcanzable con el sistema de reseñas funcionando.
- **Orgánico para "nutricionista lince": 4–6 meses.** Alcanzable.
- **Pack local para "nutricionista lima" a escala de toda la ciudad: 18+ meses**, y depende de llegar a un volumen de reseñas comparable al de Carolina. No es donde debes medir el éxito este año.

**El único número que importa los primeros 90 días son las reseñas.** Todo lo demás del roadmap se cae si esa parte no se ejecuta.
