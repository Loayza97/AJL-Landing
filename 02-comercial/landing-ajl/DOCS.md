# Documentación: AJL Nutrición Landing Page

> Fuente: PRD v1.1 · Mayo 2026 · Repo: `Loayza97/AJL-Landing`

---

## Resumen ejecutivo

Landing page de **precalificación pasiva** para AJL Nutrición. Convierte tráfico frío/tibio (IG, TikTok, Meta Ads, referidos) en leads calificados que llegan a WhatsApp listos para contratar un plan o agendar una Evaluación S/80.

**Hipótesis central:** filtro pasivo (contenido honesto + criterios explícitos) mejora calidad del lead sin sacrificar volumen. Se valida con 60 días de tráfico estable post-lanzamiento.

---

## Jerarquía de conversión (decisión v1.1)

```
Ver planes → Elegir plan → WhatsApp
                    ↓
         (si indeciso) → Evaluación S/80 → WhatsApp
```

- **Producto principal:** planes mensuales
- **Fallback:** Evaluación Nutricional S/80 (para indecisos)
- **No hay carrito ni pago online en v1.0**

---

## Planes

| Plan | Precio | Destacado |
|------|--------|-----------|
| Básico | S/250/mes | — |
| Acompañamiento | S/320/mes | — |
| Constancia | S/440/mes | ✓ Recomendado |
| Transformación | S/600/mes | — |

- Cada plan tiene CTA a WhatsApp con mensaje pre-llenado (`"Hola, me interesa el plan [Nombre] de AJL Nutrición"`)
- Precios de programas 3 y 6 meses disponibles donde aplique

**Evaluación S/80:** 20–30 min · diagnóstico + dirección · los S/80 se descuentan del primer mes si contrata un plan.

---

## Flujo de la página (orden de secciones)

1. **Hero** — valida frustración previa, CTA hace scroll a planes (no a WhatsApp)
2. **Por qué fallaste antes** — tabla "lo que el paciente dice" vs "el problema real"
3. **Cómo funciona el método** — 6 pasos + "Tu parte en el proceso"
4. **Planes** — 4 planes con CTAs individuales
5. **¿Qué incluye cada plan?** — tarjetas por componente con etiquetas por plan
6. **Pacientes reales** — mínimo 3 testimonios (pendiente contenido real)
7. **Para quién sí / Para quién no** — filtro pasivo central
8. **Evaluación S/80** — fallback para indecisos
9. **FAQ** — acordeón, 6 preguntas clave
10. **Footer** — contacto, CTA WA, aviso legal

**Botón flotante WhatsApp:** visible todo el tiempo desde el primer segundo de carga.

---

## Personas

| Persona | Perfil | Entrada |
|---------|--------|---------|
| Carla, 34 (frío) | Gerente mkt, múltiples intentos fallidos | Meta Ads |
| Diego, 38 (tibio) | Ingeniero, come fuera frecuentemente | IG/TikTok link bio |
| Valeria, 41 (caliente) | Abogada, referida, llega decidida | Referido/seguidor |
| Miguel, 29 (no calificado) | Quiere "dieta mágica", se autodescarta | Cualquiera |
| Rodrigo (asesor) | Recibe el lead en WA con contexto | — |

---

## UTMs configurados

| Canal | UTM |
|-------|-----|
| Instagram bio | `utm_source=ig&utm_medium=bio` |
| TikTok bio | `utm_source=tt&utm_medium=bio` |
| Meta Ads | `utm_source=meta&utm_medium=ads&utm_campaign=<nombre>` |
| ManyChat | `utm_source=manychat&utm_medium=dm` |
| Referidos | `utm_source=referido` |
| Directo | Sin UTM (registrado, mensaje va sin etiqueta) |

**Estado:** UTMs pendientes de aplicar en canales (bios + ManyChat).

---

## Eventos de tracking

| Evento | Trigger |
|--------|---------|
| `scroll_frustracion` | Usuario llega a "Por qué fallaste" |
| `scroll_metodo` | Usuario llega a sección método |
| `scroll_testimonios` | Usuario llega a testimonios |
| `scroll_para_quien` | Usuario llega a "Para quién sí/no" |
| `whatsapp_click` | Clic en cualquier CTA de plan/evaluación (incluye `section_id` + `package_name`) |
| `whatsapp_click_floating` | Clic en botón flotante |

---

## Stack técnico

- **Framework:** Astro (sitio estático)
- **Deploy:** Netlify (repo en GitHub `Loayza97/AJL-Landing`)
- **Tipografía:** Montserrat (fallback de Gilroy) — pesos 700/800/900
- **Paleta:** `#000000` · `#FFFFFF` · `#F5F5F5` · `#D4A843`
- **WhatsApp:** `https://wa.me/51919151237?text=<mensaje>`
- **HTTPS:** Netlify (HTTP → HTTPS en `netlify.toml`)
- **Imágenes:** WebP/AVIF + lazy loading

---

## Métricas objetivo

| Métrica | Meta |
|---------|------|
| Clic en CTA WA | >15% visitantes |
| Scroll hasta planes | >50% visitantes |
| Scroll hasta "Para quién" | >40% visitantes |
| Rebote en hero | <50% |
| Conversión lead→cliente | >25% (vs ~3.5% actual) |
| Lighthouse Performance (mobile) | >85 |
| Lighthouse Accessibility | >90 |
| LCP | <2.5s |
| Carga en 3G | <4s |

---

## Pendientes activos (v1.1)

| # | Pendiente | Bloqueante para |
|---|-----------|----------------|
| P1 | Deploy en Netlify | URL pública |
| P2 | Activar GA4 (Measurement ID) | Analytics |
| P3 | Activar Meta Pixel (Pixel ID) | Tracking ads |
| P4 | Aplicar UTMs en bios IG/TT y ManyChat | Trazabilidad |
| P5 | Reemplazar testimonios placeholder | Prueba social |
| P6 | Foto real en hero | Identidad |
| P7 | Texto legal política de privacidad | Compliance |

---

## User stories resumen

| ID | Historia | Prioridad |
|----|----------|-----------|
| US-001 | Aterrizar desde Instagram orgánico | Alta |
| US-002 | Aterrizar desde Meta Ads | Alta |
| US-003 | Aterrizar desde TikTok (mobile) | Alta |
| US-004 | Aterrizar desde ManyChat | Media |
| US-005 | Aterrizar como referido → WA directo | Alta |
| US-006 | Sin UTM → flujo sin errores | Alta |
| US-007 | Leer sección "Por qué fallaste" | Alta |
| US-008 | Comprender método 6 pasos | Alta |
| US-009 | Conocer Evaluación S/80 | Media |
| US-010 | Ver planes y elegir uno | Alta |
| US-010b | Detalle de componentes por plan | Alta |
| US-011 | Autoidentificarse (para quién sí/no) | Alta |
| US-012 | Resolver dudas en FAQ | Media |
| US-013 | CTA WA desde cualquier sección | Alta |
| US-014 | Botón flotante WA siempre visible | Alta |
| US-015 | Compartir link (Open Graph) | Baja |
| US-016 | Cargar en 3G/4G lento | Alta |
| US-017 | HTTPS garantizado | Alta |
| US-018 | Asesor recibe lead con contexto pre-llenado | Alta |
| US-019 | Ver testimonios reales | Media |
| US-020 | Entender compromiso requerido | Alta |
| US-021 | Aviso cookies y privacidad | Media |

---

*Generado automáticamente desde PRD-AJL-Nutricion-v1.md · 2026-05-13*
