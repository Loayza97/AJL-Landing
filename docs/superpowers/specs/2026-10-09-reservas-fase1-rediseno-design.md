# Reservas y pago web, fase 1 del rediseño

Fecha: 2026-10-09 · Rama: `reservas-pago` · Spec anterior: `2026-10-01-reservas-y-pago-design.md` (sigue vigente en todo lo que este documento no cambia).

## Objetivo

Llevar a la web el flujo rediseñado con el equipo (lienzo "Reservas AJL · flujo", opción B en la pantalla 2), con los precios de la hoja "Paquetes por permanencia" (incluye 6 meses) y cuotas con tarjeta de crédito, sin fallas: cada regla con prueba automática y una prueba de punta a punta en la versión de prueba antes de producción.

## Fuera de alcance (fase 2)

- Fotos de las nutricionistas y botón "Más sobre" en la pantalla 3 (falta contenido).
- Distrito opcional después del pago.
- Confirmación por WhatsApp.
- Pagos recurrentes o suscripción.

## Decisiones tomadas

| Tema | Decisión | Origen |
| --- | --- | --- |
| Pantalla 2 | Opción B: tres tarjetas lado a lado | Alejandro, 2026-10-09 |
| Pantalla 1 | Igual que el tablero "1 · Elige tu acompañamiento": sin precios, botón "Elegir y ver precios" | Joaquín, 2026-10-09 |
| Colores | Los de la tabla de precios de la web (`src/components/Plans.astro`): tinta `#111111`, dorado `#C9A24B`, dorado tinta `#9C7A2B`, papel `#FFFFFF`, gris `#6B6B6B`, línea `#E4E4E4`, fuente Montserrat | Joaquín, 2026-10-09 |
| Cuotas | Hasta 12 con tarjeta de crédito, con interés del banco; AJL paga la comisión de contado | Ya en `fa32a22` |
| Contacto a quien no paga | Sin aviso en la pantalla 4; va en la política de privacidad y en el resumen de la ventana de privacidad | Joaquín, 2026-10-09 |
| Sesión de 30 min | "2ª control de 30 min" sin promesa de plan | Romi, 2026-10-05 (pendiente alinear con Alejandro; solo cambia un texto) |

## Precios (fuente única `src/data/plans.js`)

| Plan | 1 mes | 3 meses | 6 meses | Congelar |
| --- | --- | --- | --- | --- |
| 1 sesión al mes (`acompanamiento`) | S/320 | S/810 (S/270 al mes) | S/1.500 (S/250 al mes) | 3m: 1 semana · 6m: 2 semanas |
| 2 sesiones al mes (`constancia`) | S/440 | S/1.080 (S/360 al mes) | S/1.950 (S/325 al mes) | igual |
| 4 sesiones al mes (`transformacion`) | S/600 | S/1.530 (S/510 al mes) | S/2.808 (S/468 al mes) | igual |
| Una sola sesión (`basico`) | S/250 | | | |
| Evaluación (`evaluacion`) | S/80 | | | |

- `programs` de cada plan mensual pasa a tener dos entradas, 3 y 6 meses, en ese orden. Todo código que hoy lee `programs[0]` sigue viendo 3 meses.
- El ahorro se calcula, no se escribe a mano: `precio_mes × meses − total`, y el porcentaje redondeado al entero. Ej.: 2 sesiones, 6 meses: S/2.640 − S/1.950 = S/690 (26%).
- `cotizar(producto, duracion)` acepta 1, 3 y 6 para los mensuales; 1 para `basico` y `evaluacion`; cualquier otra combinación devuelve `null` y el servidor responde 400.
- El título que va a Mercado Pago y a los correos lleva la duración: "2 sesiones al mes · 6 meses".
- La landing (`Plans.astro`) agrega la columna "6 meses" con total y equivalente mensual, como la hoja. Sin tachados en la landing.

## Pantallas

1. **Elige tu acompañamiento.** Banda "Todos incluyen tu seguimiento entre sesiones" (plan en la app, equipo por WhatsApp, 2 clases en vivo por semana). Tres tarjetas con lo que incluye cada una; las de 2 y 4 sesiones con "De regalo: evaluación de cierre del primer mes"; la de 2 sesiones marcada "Recomendado". Abajo, "Sin seguimiento continuo": una sola sesión y "¿Prefieres que te evaluemos antes?". Ningún precio en esta pantalla.
2. **¿Por cuánto tiempo?** Tres tarjetas: Mes a mes, 3 meses (Recomendado, al centro), 6 meses. En 3 y 6 meses: precio normal por mes tachado, precio por mes del paquete, "S/X en total · puedes pagarlo en cuotas", "Si viajas, puedes congelarlo N semana(s)" y la etiqueta de ahorro. Debajo, "Así son tus consultas cada mes" según el plan y la nota de cuotas. En pantallas angostas las tarjetas se apilan con 3 meses primero.
3. **Elige con quién y cuándo.** El selector actual, sin cambios de lógica, con los colores nuevos.
4. **¿A nombre de quién?** Campos obligatorios: nombres, apellido paterno, WhatsApp con país, correo, fecha de nacimiento y documento (tipo DNI, Carné de Extranjería o Pasaporte, más su número). Apellido materno opcional: hay pacientes extranjeros sin segundo apellido. Resumen del plan con total y "Con tarjeta de crédito, en hasta 12 cuotas". "Condiciones del servicio" y "política de privacidad" abren una ventana encima (resumen en 5 puntos y link a la versión completa) sin perder lo escrito ni el horario. No hay aviso visible de que escribiremos a quien no pague: eso lo dicen la política de privacidad y su resumen en la ventana (decisión de Joaquín, 2026-10-09). Casilla de novedades opcional, como hoy.
5. **Mercado Pago.** Sin cambios.
6. **Listo.** Sin cambios.

## Validación en el servidor (`handlePagar`)

- Nombres y apellido paterno: 2 a 60 caracteres, al menos una letra; se aceptan tildes, ñ, apóstrofo, guion y espacios. Apellido materno: vacío o con la misma regla.
- Documento: siempre. DNI 8 dígitos; Carné de Extranjería 9 a 12 letras o dígitos; Pasaporte 6 a 12 letras o dígitos.
- Fecha de nacimiento: `AAAA-MM-DD` válida, no futura, edad entre 10 y 100 años en la zona de Lima.
- WhatsApp, correo y aceptación: como hoy.
- El navegador valida lo mismo para avisar antes, pero el servidor es el que decide.

## Datos

Migración `db/d1/0002_cliente_detalle.sql`, solo agrega:

```sql
ALTER TABLE clientes ADD COLUMN nombres TEXT;
ALTER TABLE clientes ADD COLUMN apellido_paterno TEXT;
ALTER TABLE clientes ADD COLUMN apellido_materno TEXT;
ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE clientes ADD COLUMN tipo_documento TEXT;
CREATE TABLE resumenes_enviados (fecha TEXT PRIMARY KEY, enviado_en TEXT NOT NULL);
```

- `clientes.dni` guarda el número del documento y `tipo_documento` dice cuál es (`dni`, `ce`, `pasaporte`).
- `clientes.nombre` se sigue llenando con el nombre completo ("Nombres Paterno Materno", sin el materno si no lo hay), así correos, calendario y Mercado Pago no cambian.
- La purga de no pagados a los 30 días borra también las columnas nuevas.
- Se aplica primero en `ajl-reservas-preview` y, al lanzar, en `ajl-reservas`.

## Resumen diario de quienes no pagaron

- Endpoint `POST /api/reservas/resumen-diario`, protegido con el encabezado `Authorization: Bearer <RESUMEN_TOKEN>` (secreto nuevo en Cloudflare Pages, producción y preview).
- Junta las reservas que dejaron datos y no se pagaron en las últimas 24 horas (estado `expirada`, o `apartada`/`pagando` con plazo vencido, con cliente), sin las de personas que luego sí pagaron con el mismo correo. Manda un correo a `NOTIFICATION_EMAIL` con nombre, WhatsApp, plan, duración, hora elegida y un link `wa.me`. Si no hay nadie, no manda nada.
- Idempotente por fecha de Lima en `resumenes_enviados`: llamarlo dos veces el mismo día manda un solo correo.
- Lo dispara un Worker aparte con cron (`workers/resumen-cron/`, `wrangler.toml` propio, `0 13 * * *` = 8:00 Lima) que solo hace el POST con el token. Se despliega con `wrangler deploy`.

## Textos legales (código y política dicen lo mismo)

- `condiciones.astro`: plazos de 3 y 6 meses, congelar 1 y 2 semanas, cuotas con interés del banco. Sube `CONDICIONES_VERSION` a `2026-10-09`.
- `public/privacidad/index.html` 2.6 y tablas: nombres y apellidos, fecha de nacimiento (para preparar la primera sesión), documento de identidad siempre (comprobante), el contacto por WhatsApp a quien no completa el pago dentro de los 30 días y el resumen interno al equipo. Sube a versión 1.5.

## Pruebas

- Unitarias (`node --test`): precios y ahorro de cada plan y duración; `cotizar` rechaza duraciones inválidas; validación de cada campo con sus bordes (fecha 29 de febrero, edad 9 y 101 años, DNI de 7 dígitos, pasaporte con letras, apellido con tilde y apóstrofo, materno vacío); migración aplicada sobre la base de prueba; purga de columnas nuevas; resumen: elige bien a quién incluir, excluye a quien pagó después, no repite en el mismo día, rechaza sin token.
- Construcción: `npm run build` sin errores.
- Punta a punta en `https://reservas-pago.ajl-landing.pages.dev`: paquete de 6 meses pagado en 3 cuotas con el comprador de prueba; reserva confirmada, evento en el calendario, 3 correos; una reserva sin pagar aparece en el resumen al llamarlo a mano. Revisión visual en celular y computadora.
- Producción solo después, con autorización de Joaquín.
