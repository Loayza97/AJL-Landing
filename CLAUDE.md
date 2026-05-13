# CLAUDE.md — AJL Nutrición Landing Page

> Estado: **implementado y funcionando**. Servidor: `npm run dev` → http://localhost:4321/
> Léeme primero antes de cualquier sesión nueva.

## Qué es este proyecto

Landing page de **precalificación pasiva** para AJL Nutrición, clínica de nutrición premium con base en Lima, Perú. La página tiene una función única: derivar leads calificados al WhatsApp del asesor comercial (Rodrigo) con UTM de origen pre-llenado, para que agenden una Evaluación Nutricional Personal de S/80 (producto de entrada del funnel).

**No es:** un sitio web institucional, un e-commerce, ni una página con quiz interactivo de calificación.

**Sí es:** una landing estática con filtro pasivo basado en contenido honesto y una sección prominente de "Para quién sí / Para quién no".

## Hipótesis estratégica que validamos

Precalificar al lead antes (en reels/stories/ads) y durante la landing (vía contenido + criterios explícitos), **sin formularios interactivos**, mejora la calidad del lead que llega al asesor sin sacrificar volumen significativo.

**Baseline actual:** ~3.5% de conversión en WhatsApp.
**Ventana de validación:** 60 días de tráfico estable post-lanzamiento.

## Documentos clave (en este orden)

1. **`PRD-AJL-Nutricion-v1.md`** — Product Requirements Document v1.0. Fuente de verdad para alcance, requisitos funcionales y user stories.
2. **`docs/CONTEXTO-ASESOR-LANDING.md`** — Contexto de marca, método, cliente ideal, identidad visual, tono de comunicación. Fuente de verdad para copy y diseño.

## Decisiones clave ya tomadas (no las reabras sin avisar)

- **Stack:** Astro (sitio estático) desplegado en hosting estático (Vercel / Netlify / Cloudflare Pages / GitHub Pages).
- **Tamaño del proyecto:** Pequeño, 2–4 semanas de extremo a extremo.
- **Identidad visual:** Blanco/negro como base, dorado (~#D4A843) como acento. Gilroy Bold/ExtraBold con fallback a Montserrat o Poppins.
- **Mobile-first:** la mayoría del tráfico viene de Instagram y TikTok en móvil.
- **No hay quiz interactivo en la landing.** El filtro pasa al contenido (especialmente la sección "Para quién sí / Para quién no") y al filtro upstream en reels/stories.
- **CTA único:** todos los caminos llevan a WhatsApp vía `wa.me` con mensaje pre-llenado que incluye UTM de origen.
- **Sin sistema de pagos, sin carrito, sin login en v1.0.** Los paquetes se muestran de forma informativa; la venta se cierra en WhatsApp después de la Evaluación de S/80.
- **Ventana de medición:** 60 días post-lanzamiento.

## Decisiones pendientes (marcadas como `[ABIERTO]` en el PRD)

Antes de implementar, hay que cerrar estos puntos. No los inventes: pregúntale al usuario.

- **Convención exacta de UTMs por canal** (ej. valores literales de `utm_source`, `utm_medium`, `utm_campaign` para cada origen).
- **Selección de testimonios a incluir** (qué pacientes reales, en qué formato).
- **Decisión de analytics:** ¿GA4, Plausible, Umami u otro? Hoy está pendiente.
- **Cookie banner:** consulta legal pendiente sobre obligatoriedad bajo Ley 29733 (Perú).
- **Política de privacidad:** texto legal está como ítem de roadmap; puede usarse placeholder en v1.0.
- **Dominio personalizado:** hoy GitHub Pages, futuro dominio propio.
- **Foto del hero:** ideal foto real de Alejandro o consulta, no stock. A definir con el equipo.
- **Licencia de Gilroy:** si no hay licencia web, usar fallback (Montserrat o Poppins en Google Fonts) desde el inicio.

## Stakeholders

- **Alejandro Loayza Jordán** — CEO y dueño de la marca. Aprueba copy y dirección estratégica.
- **Rodrigo** — Asesor comercial interno. Recibe los leads en WhatsApp. Validar con él que el contexto pre-llenado le sea útil.
- **Equipo de 6 nutricionistas** — operan las consultas. No participan directamente en la landing.

## Tono y reglas innegociables de copy

### Siempre incluir
- Validación del intento fallido previo del lead.
- Diferenciador estructural (no planes ideales, sino vida real).
- Precio visible S/80 con el descuento "se aplica al primer mes si contratas un paquete".
- Criterios de quién SÍ es el cliente ideal.
- Criterios de quién NO (filtra sin rechazar con dureza).

### Nunca incluir
- Promesas de pérdida de peso específica ("baja X kilos en Y semanas").
- "Método revolucionario" ni lenguaje de gurú.
- Resultados garantizados.
- Demonización de alimentos ("el azúcar es veneno").

## Estructura del repo

```
ajl-nutricion-/
├── CLAUDE.md                          ← este archivo
├── PRD-AJL-Nutricion-v1.md            ← PRD completo (fuente de verdad de requisitos)
├── docs/
│   └── CONTEXTO-ASESOR-LANDING.md     ← contexto de marca, método, copy, identidad visual
├── src/
│   ├── config.js                      ← número WA, SITE_TITLE, SITE_DESCRIPTION, OG_IMAGE
│   ├── pages/
│   │   └── index.astro                ← única página — monta todos los componentes
│   ├── layouts/
│   │   └── Layout.astro               ← head, OG tags, fuentes, Meta Pixel (comentado), GA4 (comentado),
│   │                                     JS client-side: UTM capture, WhatsApp links, scroll tracking, cookie banner
│   ├── components/
│   │   ├── Hero.astro                 ← titular + CTA → #section-packages (scrolls a paquetes, no a WA directo)
│   │   ├── WhyFailed.astro            ← tabla "lo que el cliente dice" vs "problema real"
│   │   ├── Method.astro               ← 6 pasos del método
│   │   ├── Packages.astro             ← 5 paquetes con precios y CTA WA por paquete
│   │   ├── PlanDetails.astro          ← detalle de la Evaluación Nutricional S/80
│   │   ├── Testimonials.astro         ← testimonios (contenido placeholder)
│   │   ├── ForWho.astro               ← "Para quién sí / Para quién no" (filtro pasivo central)
│   │   ├── Evaluation.astro           ← CTA final hacia WA
│   │   ├── FAQ.astro                  ← acordeón de preguntas frecuentes
│   │   ├── Footer.astro               ← links de redes, WA, aviso legal
│   │   ├── FloatingWhatsApp.astro     ← botón flotante esquina inferior derecha
│   │   └── CookieBanner.astro         ← banner de cookies (se cierra con localStorage)
│   └── styles/
│       └── global.css                 ← variables CSS (--gold, --black, --white), reset, btn-primary, tipografía
├── public/
│   └── favicon.svg
├── astro.config.mjs                   ← site: 'https://ajlnutricion.com' (TODO: actualizar con dominio real)
└── netlify.toml                       ← deploy config para Netlify
```

## Estado de implementación

| Fase | Estado |
|------|--------|
| Setup Astro + estructura | ✅ Completo |
| Hero, WhyFailed, Method, ForWho, FAQ, Footer | ✅ Implementados |
| Packages (5 paquetes con CTA WA por paquete) | ✅ Implementado |
| PlanDetails (Evaluación S/80) | ✅ Implementado |
| Botón flotante WA | ✅ Implementado |
| UTM capture + mensaje pre-llenado | ✅ Implementado (client-side en Layout.astro) |
| Scroll tracking por sección | ✅ Implementado (IntersectionObserver) |
| Cookie banner | ✅ Implementado |
| Open Graph tags | ✅ Implementado (falta og-image real) |
| Testimonials | ⚠️ Placeholder — contenido real pendiente |
| Meta Pixel | ⏳ Comentado — falta PIXEL_ID del negocio |
| GA4 / analytics | ⏳ Comentado — decisión de herramienta pendiente |
| og-image | ⏳ Falta `/public/og-image.jpg` real |
| Dominio personalizado | ⏳ Hoy `ajlnutricion.com` en config — no verificado |

## Pendientes antes del deploy

1. **`/public/og-image.jpg`** — foto de Alejandro o consulta real (no stock). Formato recomendado: 1200×630px.
2. **Meta Pixel ID** — descomentar bloque en `Layout.astro` y reemplazar `PIXEL_ID`.
3. **Analytics** — decidir GA4 vs Plausible/Umami; descomentar bloque correspondiente en `Layout.astro`.
4. **Testimonios** — reemplazar contenido placeholder en `Testimonials.astro` con casos reales.
5. **Convención UTM por canal** — validar valores exactos con el equipo (ej. `utm_source=ig`, `utm_source=tt`, etc.).
6. **Dominio** — actualizar `site` en `astro.config.mjs` y `og:url` en `Layout.astro` con el dominio real confirmado.
7. **Licencia Gilroy** — si hay licencia web, reemplazar Montserrat por Gilroy en `global.css`. Si no, dejar Montserrat.

## Cómo retomar trabajo en una sesión nueva

> "Lee CLAUDE.md y dime qué falta antes del deploy."

O directamente:

> "Quiero trabajar en [testimonios / og-image / Meta Pixel / copy de X sección]."

## Conexión con WhatsApp (referencia técnica rápida)

El link sigue este patrón:
```
https://wa.me/<NUMERO_PERUANO>?text=<MENSAJE_URL_ENCODED>
```

El mensaje pre-llenado debe:
- Ser corto, natural, en primera persona del lead.
- Incluir el UTM de origen al final (o "origen: directo" si no hay UTM).
- Ser editable por el lead antes de enviar.
- Mantenerse bajo el límite que `wa.me` tolera (~recomendado <200 caracteres visibles para evitar truncamiento).

Ejemplo conceptual:
```
"Hola, vengo de la web. Quisiera saber más sobre la Evaluación de S/80.
(origen: ig_bio)"
```
