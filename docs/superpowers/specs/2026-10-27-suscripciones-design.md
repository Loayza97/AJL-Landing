# Pagos con suscripción · diseño

Fecha: 2026-10-27 · Pedido de Joaquín y Alejandro · Rama `reservas-pago` · Diseño visual: https://claude.ai/artifact/CgmKB9PL2wXVqCN3C9osCy

## Problema

Hoy cada pago es único (Checkout Pro). El mes a mes se paga a mano cada mes y los paquetes de 3 y 6 meses se pagan completos al inicio (con cuotas de tarjeta). Hay pacientes a los que el paquete les conviene por precio pero no pueden pagarlo de golpe, y renovar exige que el equipo les escriba.

## Objetivo

Más formas de pago y suscripciones que se mantienen solas: el paciente paga cada mes el precio con descuento del paquete, Mercado Pago cobra solo, y el paquete se renueva sin que el equipo tenga que escribirle.

Éxito: Lucía elige Constancia 3 meses con «Pago mensual automático» en /reservar/, paga S/360 con Yape o tarjeta, su cita queda confirmada como hoy, a los 30 días Mercado Pago le cobra otros S/360 sin intervención, el panel muestra «2 de 3», y 7 días antes del cuarto cobro le llega el aviso de renovación.

## Decisiones (2026-10-27)

- Aplica a los tres planes mensuales (Acompañamiento, Constancia, Transformación) en sus tres duraciones. Evaluación y Básico siguen como pago único.
- **Mes a mes:** pago mensual automático al precio normal, cancelable cuando quiera, sin penalidad.
- **Paquetes de 3 y 6 meses:** pago mensual automático al precio por mes del paquete (`porMes` de `duraciones.js`). El pago completo de hoy sigue igual como alternativa.
- **Penalidad:** si cancela a mitad de un paquete, paga una vez el ahorro de un mes: `precio mes a mes − porMes del paquete`. Con los precios del 27-oct:

  | Plan | 3 meses | 6 meses |
  |---|---|---|
  | Acompañamiento (S/320) | S/270 · penalidad S/50 | S/250 · penalidad S/70 |
  | Constancia (S/440) | S/360 · penalidad S/80 | S/325 · penalidad S/115 |
  | Transformación (S/600) | S/510 · penalidad S/90 | S/468 · penalidad S/132 |

  Se calcula desde `plans.js`/`duraciones.js`, nunca escrita a mano.
- **Cancelar en el último mes del paquete** (antes de que empiece el siguiente) no cuesta nada: es «no renovar».
- **Renovación:** automática por otro paquete igual, al mismo precio que pagaba. Aviso por correo al paciente 7 días antes del primer cobro del nuevo paquete, con cómo cancelar gratis.
- **Precio congelado:** cuota y penalidad se guardan al suscribirse. Si cambian los precios, los suscritos siguen con los suyos hasta que se decida otra cosa.
- **Cobro fallido:** cuando Mercado Pago agota sus reintentos, se trata como cancelación (con penalidad si estaba a mitad de paquete) y se avisa al equipo. El link de pago de la penalidad lo manda el equipo a mano por WhatsApp.
- **Entradas:** desde /reservar/ (con cita) y desde un link de suscripción que crea el equipo en el panel (sin cita; las citas se agendan con los links de agenda de siempre).
- **Integración:** suscripción de Mercado Pago sin plan asociado, con pago pendiente (`POST /preapproval`, el paciente autoriza en la página de Mercado Pago vía `init_point`). Una sola suscripción sin fecha de fin por paciente y paquete; el mes del paquete lo lleva nuestra base, no Mercado Pago.

## Pantallas

Ver el diseño visual (7 pantallas). Resumen:

### /reservar/

- **Paso 2:** al elegir duración aparece «¿Cómo quieres pagar?»: «Pago mensual automático» (cuota al mes, se renueva cada N meses, aviso 7 días antes, no renovar no cuesta nada, penalidad si cancela a mitad) y «Pago completo» (como hoy). En Mes a mes: «Pago mensual automático» sin penalidad, o pagar el mes una vez como hoy.
- **Paso 3:** sin cambios (elige hora; la retención de la hora funciona igual).
- **Paso 4:** el resumen muestra cuota, «hoy pagas», próximos cobros y fecha de renovación. Casilla obligatoria aparte: «Acepto el cobro mensual automático, la renovación cada N meses y la penalidad de S/X si cancelo a mitad del paquete.» Botón «Suscribirme con Mercado Pago».
- **Página de Mercado Pago:** el `reason` de la suscripción dice «AJL Nutrición · Constancia, 3 meses» y el cobro en el estado de cuenta sale como `AJLNUTRICION`, para que el paciente lo reconozca. El nombre y el logo del vendedor salen de la cuenta de Mercado Pago de AJL (revisar que estén puestos).
- **Vuelta de Mercado Pago:** igual que hoy (`/reservar/listo/`), con el texto de suscripción. Si el primer cobro llegó tarde y la hora se liberó, queda `pagada_sin_hora` como hoy.

### Link de suscripción (`/suscribirse/?s=<token>`)

- Muestra nombre del paciente, plan, paquete, cuota, ahorro y «cómo funciona»; pide el correo (Mercado Pago lo exige) y la casilla de aceptación; botón «Suscribirme con Mercado Pago».
- Sirve una vez y vence a los 7 días, como los links de agenda.
- Al volver: «¡Listo! Tu suscripción está activa. Te escribimos por WhatsApp para agendar tu primera sesión.»

### Panel

- **«Cobrar con suscripción»:** nombre del paciente, plan, paquete (cada opción muestra cuota y penalidad). Crea el link; Copiar y Enviar por WhatsApp.
- **«Suscripciones»:** filtros Todas · Activas · Renuevan en 7 días · Cobro fallido · Penalidad por cobrar · Canceladas. Columnas: paciente (nombre, DNI), plan y paquete, mes del paquete («2 de 3»; «—» en mes a mes), cuota, próximo cobro (o fecha del fallo), estado y penalidad, acciones (WhatsApp, «Marcar penalidad pagada»).
- Cada cobro mensual también aparece en «Reservas» y sale en «Copiar para la base maestra» (producto, N = mes del paquete sobre el total, soles y neto).

### Correos

- **Al paciente:** confirmación de la suscripción; recibo de cada cobro; aviso de renovación 7 días antes.
- **Al equipo** (`CORREOS_EQUIPO`): suscripción nueva; cobro fallido sin reintentos; cancelación a mitad de paquete (con penalidad); cancelación en el último mes («No renovará, sin penalidad»).

## Datos (D1, migración nueva)

- `suscripciones`: `id`, `token` (para el link y la vuelta), `cliente_id`, `reserva_id` (null si vino de link), `producto`, `duracion_meses` (1, 3 o 6), `cuota_centimos`, `penalidad_centimos` (0 en mes a mes), `mp_preapproval_id`, `estado` (`pendiente` · `activa` · `cobro_fallido` · `cancelada` · `vencida` si el link no se usó), `cobros_aprobados`, `proximo_cobro`, `aviso_renovacion_en`, `cancelada_en`, `motivo_cancelacion` (`paciente` · `cobro_fallido` · `equipo`), `penalidad_estado` (`no_aplica` · `por_cobrar` · `pagada`), `penalidad_marcada_por`, `creado_por` (correo del equipo si vino de link), `creado_en`, `actualizado_en`, `acepto_condiciones_version`.
- `suscripcion_cobros`: `id`, `suscripcion_id`, `mp_payment_id` (único), `numero` (1, 2, 3…), `mes_paquete` (1..N), `estado`, `monto_centimos`, `neto_centimos`, `metodo`, `creado_en`.
- El mes del paquete sale de `((numero − 1) mod duracion_meses) + 1`. Cancelar con `mes_paquete < duracion_meses` del último cobro aprobado → penalidad; `=` → sin penalidad. Mes a mes nunca tiene penalidad.

## Servidor

- `server/suscripciones/calculo.mjs` (puro, probado sin red): cuota, penalidad, mes del paquete, si corresponde penalidad, fechas de próximos cobros y de aviso.
- `server/reservas/mercadopago.mjs` suma `crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, email, urlRetorno })` → `{ id, init_point }` (`auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount, currency_id: 'PEN' }`, `external_reference: suscripcionId`, `status: 'pending'`), `obtenerSuscripcion(id)` y `obtenerCobroSuscripcion(id)`.
- `/api/reservas/pagar` acepta `forma: 'mensual'`: crea la suscripción en vez de la preferencia. El monto lo calcula el servidor desde el catálogo; el navegador solo manda producto, duración y forma.
- `/api/suscripciones/link` (GET datos del link, POST crear la suscripción en MP desde el link) y `/api/equipo/suscripciones` (crear link, listar, marcar penalidad pagada), con el acceso del panel.
- `/api/reservas/webhook-mp` reconoce los temas de suscripción (`subscription_preapproval`, `subscription_authorized_payment`), verifica la firma igual que hoy y vuelve a consultar el estado en la API (nunca confía en el cuerpo):
  - Preapproval `authorized` → suscripción `activa`.
  - Cobro aprobado → registra el cobro (idempotente por `mp_payment_id`); el primero confirma la reserva como hoy el pago único.
  - Preapproval `cancelled` → `cancelada` con penalidad si corresponde; aviso al equipo.
- Tarea diaria (el Worker `ajl-resumen-cron` que ya manda el resumen): avisos de renovación pendientes; suscripciones cuyo cobro falló sin más reintentos (se cancela en MP y se marca `cobro_fallido` con penalidad si corresponde); links vencidos.

## Riesgos que se prueban en el modo de prueba de Mercado Pago antes de abrirlo

1. Que el primer cobro llegue en minutos tras autorizar (la hora se retiene 15 a 30 minutos). Si tarda, el flujo cae en `pagada_sin_hora` como hoy.
2. Que Yape y tarjeta de débito sirvan para cobros recurrentes en Perú.
3. Cómo informa Mercado Pago que agotó los reintentos de un cobro (estado del preapproval o del cobro) para detectarlo bien.
4. Si `payer_email` tiene que coincidir con la cuenta con la que el paciente paga.
5. Que el paciente pueda cancelar desde su cuenta y nos llegue el aviso.

## Legal y textos

- Condiciones del servicio: sección nueva de pago mensual automático (renovación, aviso 7 días antes, cómo cancelar, penalidad por plan). Versión nueva de `acepto_condiciones_version`.
- Política de privacidad: declarar los datos nuevos que guardamos (suscripción y cobros) si no están cubiertos por los del pago único.
- Libro de reclamaciones sin cambios.

## Fuera de alcance

- Cobro automático de la penalidad (se cobra con un link manual).
- Cambiar de plan o de paquete dentro de una suscripción (se cancela y se crea otra).
- Pausar o congelar una suscripción por viaje.
- Precios nuevos para los que ya están suscritos.

## Pruebas

- Unitarias de `calculo.mjs`: cuotas y penalidades de los 9 casos, mes del paquete en renovaciones, penalidad sí/no según el mes al cancelar.
- Handlers con Mercado Pago simulado: crear desde /reservar/ y desde link, webhooks fuera de orden y repetidos, primer cobro tarde (`pagada_sin_hora`), cancelación a mitad y al final, cobro fallido, link vencido y reusado.
- Prueba manual en la versión de prueba con el modo de prueba de Mercado Pago antes de publicar.
