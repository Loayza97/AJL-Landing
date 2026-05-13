# CLAUDE.md — Contexto del proyecto AJL Nutrición Landing

> Este archivo da contexto a Claude Code para retomar trabajo en este proyecto sin necesidad de re-explicar.
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

## Cómo está organizado el repo

```
ajl-nutricion-landing/
├── CLAUDE.md                          ← este archivo
├── PRD-AJL-Nutricion-v1.md            ← PRD completo
└── docs/
    └── CONTEXTO-ASESOR-LANDING.md     ← contexto de marca y método
```

A medida que avance el proyecto, espera estructura tipo Astro:
```
ajl-nutricion-landing/
├── src/
│   ├── pages/
│   ├── components/
│   ├── layouts/
│   └── styles/
├── public/
├── astro.config.mjs
└── package.json
```

## Cómo retomar trabajo en una sesión nueva

Cuando abras Claude Code en este proyecto, di algo como:

> "Lee CLAUDE.md y el PRD, y dime en qué fase estamos. Quiero avanzar con [X]."

O directamente:

> "Vamos a empezar la Fase 1 del PRD. Necesito ayuda con el copy final del hero."

## Próximos pasos sugeridos

Según el PRD, el orden recomendado es:

**Fase 1 (Definición y diseño) — 1 semana:**
1. Cerrar copy final por sección (hero, método, evaluación, paquetes, FAQ, "para quién sí/no").
2. Definir convención UTM por canal.
3. Seleccionar testimonios.
4. Diseñar en Figma todas las secciones (mobile + desktop).
5. Aprobación de stakeholders.

**Fase 2 (Implementación) — 1–1.5 semanas:**
6. Setup proyecto Astro.
7. Implementar todas las secciones estáticas.
8. Implementar CTA WhatsApp con construcción de mensaje pre-llenado vía UTM (client-side).
9. Integrar Meta Pixel y analytics (decidir GA4/Plausible/Umami).
10. Configurar eventos custom de tracking.
11. Optimización de performance (WebP, lazy loading, Lighthouse >85 mobile).
12. Open Graph tags.

**Fase 3 (Testing y deploy) — 0.5 semana:**
13. Testing manual en dispositivos reales.
14. Validar mensaje pre-llenado en todos los UTMs.
15. Deploy a producción.
16. Capacitar a Rodrigo.

**Fase 4 (Medición) — 60 días post-launch:**
17. Monitorear métricas del PRD sección 7.
18. Reportar resultados al cierre de los 60 días.
19. Decidir: continuar, pivotar o iterar a v1.1.

## Tareas concretas con las que Claude Code puede ayudar

- Generar copy de cada sección siguiendo las reglas innegociables.
- Bootstrappear el proyecto Astro con la estructura sugerida.
- Implementar componentes (Hero, Método, Evaluación, Paquetes, ParaQuien, FAQ, Footer).
- Construir el helper `buildWhatsAppLink(utmParams)` que arma el `wa.me` con mensaje pre-llenado.
- Integrar Meta Pixel y el analytics elegido.
- Configurar eventos custom (`scroll_para_quien`, `whatsapp_click` con `section_origin`, etc.).
- Optimización de imágenes a WebP/AVIF y lazy loading.
- Configuración de Open Graph y meta tags.
- Setup de despliegue en Vercel / Netlify / Cloudflare Pages.
- Auditoría Lighthouse y ajustes para hit >85 mobile.

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
