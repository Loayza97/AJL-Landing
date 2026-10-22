# Procesos de cumplimiento — Ley 29733

Templates y procesos operativos internos para cumplir con la Ley N° 29733
(Protección de Datos Personales) y su Reglamento DS N° 016-2024-JUS.

**No publicar.** Estos archivos quedan dentro de `docs/legal/` y están excluidos
del deploy a Vercel vía `.vercelignore`.

## Contenido

| Archivo | Para qué sirve |
|---|---|
| [plantilla-respuesta-arco.md](./plantilla-respuesta-arco.md) | Responder solicitudes de derechos del titular (Acceso, Rectificación, Cancelación, Oposición, Portabilidad, Olvido) dentro del plazo legal de 10 días hábiles. |
| [plan-brecha-seguridad.md](./plan-brecha-seguridad.md) | Qué hacer si se detecta una brecha de seguridad. Notificación obligatoria a la ANPDP en 48h. |
| [checklist-nuevo-procesador.md](./checklist-nuevo-procesador.md) | Pasos a seguir antes de empezar a usar una nueva herramienta SaaS que toque datos personales. |
| [decision-consentimiento-cookies.md](./decision-consentimiento-cookies.md) | Registro de decisión sobre analítica y publicidad: GA4 con consentimiento, Meta Pixel con interés legítimo y derecho de oposición. Incluye el riesgo asumido, las condiciones que obligarían a apretar, y cómo hacerlo. |

## Cuándo usar cada uno

- **Llega un email a `reclamos@ajlnutricion.com` con palabras como "borren mis datos", "qué datos tienen de mí", "dejen de usar mis datos"** → `plantilla-respuesta-arco.md`
- **Recibes notificación de Supabase / Resend / Vercel de un incidente de seguridad** → `plan-brecha-seguridad.md`
- **Alguien del equipo propone agregar una nueva herramienta (Mailchimp, Calendly, Typeform, Stripe, etc.)** → `checklist-nuevo-procesador.md`
- **Empieza a llegar tráfico de la Unión Europea, aparece un reclamo por el píxel publicitario, o se plantea cambiar qué se trackea** → `decision-consentimiento-cookies.md`

## Responsable interno

Persona responsable de privacidad: **{{NOMBRE_RESPONSABLE}}** (reemplazar antes
de operativizar). Esta persona:

- Revisa el inbox `reclamos@ajlnutricion.com` mínimo 2 veces por semana.
- Es el contacto interno ante incidentes de seguridad.
- Aprueba la incorporación de nuevos procesadores.

## Última actualización

2026-08-25 — Versión 1.1 (añadido el registro de decisión sobre cookies)
