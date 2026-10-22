# Hoja maestra de UTMs — AJL Nutrición

Fuente de verdad para los parámetros UTM de la landing `ajlnutricion.com`.
Cuando agregues o cambies un link en cualquier canal, actualízalo aquí primero.

## Convenciones

- Todo en **minúsculas**, sin espacios, separador `-`.
- `utm_source` = plataforma (`ig`, `tiktok`, `wa`, `email`, `meta-ads`).
- `utm_medium` = superficie (`bio`, `stories`, `post`, `reels`, `video`, `dm`, `feed-ad`).
- `utm_campaign` = `evergreen` para tráfico orgánico de siempre; lanzamientos = `lanzamiento-AAAAMM`.
- `utm_content` = opcional, solo para A/B testing de creatividades o copies.
- Mantener `utm_source=ig` (no `instagram`) para no partir las series históricas de GA4.

## Cómo viaja el UTM hasta la conversión

Importa entenderlo para saber qué se puede medir y qué no:

1. El visitante aterriza en una URL con UTM.
2. El Layout los guarda en `sessionStorage` (clave `ajl_utm`), así que **la
   atribución sobrevive la navegación interna**: quien entra por
   `/?utm_source=ig`, compara planes y convierte en `/checkout/basico/` sigue
   contando como `ig`.
3. Al pulsar cualquier CTA de WhatsApp, los UTM se guardan en la tabla
   `conversiones` de Supabase (fuente de verdad propia, independiente del
   consentimiento) y viajan además dentro del texto del mensaje, entre corchetes,
   para que el asesor vea de dónde vino la persona.

**Último toque dentro de la sesión:** si alguien vuelve por otra campaña en la
misma pestaña, gana la más reciente. Y como es `sessionStorage`, la atribución
dura lo que la pestaña — no persigue a nadie entre visitas.

## Links

| # | Canal | Superficie | URL con UTM |
|---|-------|------------|-------------|
| 1 | Instagram | Bio (link in bio) | `https://ajlnutricion.com/?utm_source=ig&utm_medium=bio&utm_campaign=evergreen` |
| 2 | Instagram | Stories destacadas | `https://ajlnutricion.com/?utm_source=ig&utm_medium=stories&utm_campaign=evergreen` |
| 3 | Instagram | Story diaria con link | `https://ajlnutricion.com/?utm_source=ig&utm_medium=stories&utm_campaign=evergreen&utm_content=story-diaria` |
| 4 | Instagram | Reel (link referenciado) | `https://ajlnutricion.com/?utm_source=ig&utm_medium=reels&utm_campaign=evergreen` |
| 5 | Instagram | Post / carrusel | `https://ajlnutricion.com/?utm_source=ig&utm_medium=post&utm_campaign=evergreen` |
| 6 | Instagram | DM manual | `https://ajlnutricion.com/?utm_source=ig&utm_medium=dm&utm_campaign=evergreen` |
| 7 | TikTok | Bio (link en perfil) | `https://ajlnutricion.com/?utm_source=tiktok&utm_medium=bio&utm_campaign=evergreen` |
| 8 | TikTok | Video (link sticker) | `https://ajlnutricion.com/?utm_source=tiktok&utm_medium=video&utm_campaign=evergreen` |
| 9 | TikTok | DM manual | `https://ajlnutricion.com/?utm_source=tiktok&utm_medium=dm&utm_campaign=evergreen` |
| 10 | WhatsApp | Firma / status / difusión | `https://ajlnutricion.com/?utm_source=wa&utm_medium=manual&utm_campaign=evergreen` |
| 11 | Meta Ads | Feed | `https://ajlnutricion.com/?utm_source=meta-ads&utm_medium=feed&utm_campaign=lanzamiento-202606` |
| 12 | Meta Ads | Stories | `https://ajlnutricion.com/?utm_source=meta-ads&utm_medium=stories&utm_campaign=lanzamiento-202606` |
| 13 | Meta Ads | Reels | `https://ajlnutricion.com/?utm_source=meta-ads&utm_medium=reels&utm_campaign=lanzamiento-202606` |
| 14 | Google Business Profile | Campo "sitio web" de la ficha | `https://ajlnutricion.com/?utm_source=gbp&utm_medium=ficha&utm_campaign=evergreen` |
| 15 | Google Business Profile | Publicaciones / novedades | `https://ajlnutricion.com/?utm_source=gbp&utm_medium=post&utm_campaign=evergreen` |
| 16 | Newsletter | Correo de confirmación (cupón) | `https://ajlnutricion.com/?utm_source=email&utm_medium=newsletter&utm_campaign=cupon-bienvenida` |
| 17 | Newsletter | Envíos puntuales | `https://ajlnutricion.com/?utm_source=email&utm_medium=newsletter&utm_campaign=evergreen` |
| 18 | Presencial | QR en el consultorio | `https://ajlnutricion.com/?utm_source=qr&utm_medium=consultorio&utm_campaign=evergreen` |

### Por qué estos tres importan

- **Google Business Profile (14-15).** Es tráfico local de altísima intención:
  alguien que buscó "nutricionista en Lince" y pulsó tu ficha. Sin UTM te llega
  como `(direct)` y no puedes demostrar que el trabajo de SEO local sirve.
- **Newsletter (16-17).** Los correos del cupón no llevan UTM hoy, así que no
  hay forma de saber si el descuento del 10% trae gente o solo regala margen.
- **QR (18).** Si algún día imprimes uno, sale gratis etiquetarlo y te dice
  cuánta gente del consultorio acaba en la web.

## Segmentación en ManyChat

ManyChat puede leer `utm_source` desde el referrer para decidir flow:

- `utm_source = ig` → flow Instagram
- `utm_source = tiktok` → flow TikTok
- `utm_source = meta-ads` → flow lead pago

## Cómo leer los resultados

En GA4 → Adquisición. Y en Supabase, contra tu propia tabla:

```sql
-- Conversiones por canal, últimos 30 días (hora de Lima)
SELECT COALESCE(utm_source, '(directo)') AS canal,
       COALESCE(utm_medium, '-')         AS superficie,
       COUNT(*)                          AS conversiones
FROM conversiones
WHERE creado_en > NOW() - INTERVAL '30 days'
GROUP BY 1, 2 ORDER BY 3 DESC;

-- Qué creatividad convierte mejor dentro de una campaña
SELECT utm_content, COUNT(*)
FROM conversiones
WHERE utm_campaign = 'lanzamiento-202609'
GROUP BY 1 ORDER BY 2 DESC;

-- Embudo de checkout: preguntas vs comprobantes
SELECT seccion, COUNT(*)
FROM conversiones
WHERE seccion LIKE 'checkout-%'
GROUP BY 1 ORDER BY 2 DESC;
```

Las secciones que vas a ver en `seccion`: `hero`, `floating`, las de cada
paquete, `checkout-dudas` (pregunta antes de pagar) y `checkout-comprobante`
(manda el pago). Esa última es la que está más cerca de una venta.

## Validación post-cambio

Después de actualizar los links de bio en IG y TikTok, en 3–5 días verificar en GA4 → Adquisición → Adquisición de tráfico:

- [ ] Aparece `tiktok / bio` como nueva fila
- [ ] `(direct) / (none)` baja proporcionalmente
- [ ] `instagram.com / referral` y `l.instagram.com / referral` tienden a cero
