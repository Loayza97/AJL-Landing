# Hoja maestra de UTMs — AJL Nutrición

Fuente de verdad para los parámetros UTM de la landing `ajlnutricion.com`.
Cuando agregues o cambies un link en cualquier canal, actualizalo acá primero.

## Convenciones

- Todo en **minúsculas**, sin espacios, separador `-`.
- `utm_source` = plataforma (`ig`, `tiktok`, `wa`, `email`, `meta-ads`).
- `utm_medium` = superficie (`bio`, `stories`, `post`, `reels`, `video`, `dm`, `feed-ad`).
- `utm_campaign` = `evergreen` para tráfico orgánico de siempre; lanzamientos = `lanzamiento-AAAAMM`.
- `utm_content` = opcional, solo para A/B testing de creatividades o copies.
- Mantener `utm_source=ig` (no `instagram`) para no partir las series históricas de GA4.

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

## Segmentación en ManyChat

ManyChat puede leer `utm_source` desde el referrer para decidir flow:

- `utm_source = ig` → flow Instagram
- `utm_source = tiktok` → flow TikTok
- `utm_source = meta-ads` → flow lead pago

## Validación post-cambio

Después de actualizar los links de bio en IG y TikTok, en 3–5 días verificar en GA4 → Adquisición → Adquisición de tráfico:

- [ ] Aparece `tiktok / bio` como nueva fila
- [ ] `(direct) / (none)` baja proporcionalmente
- [ ] `instagram.com / referral` y `l.instagram.com / referral` tienden a cero
