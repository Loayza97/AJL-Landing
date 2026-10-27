# Pagos con suscripción · diseño

Fecha: 2026-10-27 · Pedido de Joaquín y Alejandro · Rama `reservas-pago` · Diseño visual: https://claude.ai/artifact/CgmKB9PL2wXVqCN3C9osCy

## Problema

Hoy cada pago es único (Checkout Pro). El mes a mes se paga a mano cada mes y los paquetes de 3 y 6 meses se pagan completos al inicio (con cuotas de tarjeta). Hay pacientes a los que el paquete les conviene por precio pero no pueden pagarlo de golpe.

## Objetivo

Más formas de pago y cobros que se mantienen solos: el paciente paga cada mes el precio con descuento del paquete y Mercado Pago cobra solo hasta completar el paquete, sin que el equipo tenga que escribirle.

Éxito: Lucía elige Constancia 3 meses con «Pago mensual automático» en /reservar/, paga S/360 con Yape o tarjeta, su cita queda confirmada como hoy, a los 30 días Mercado Pago le cobra otros S/360 sin intervención, el panel muestra «2 de 3», y tras el tercer cobro la suscripción termina sola. Si quiere irse antes, toca «Cancelar mi plan» en su recibo, paga S/80 y queda cancelada sin que nadie del equipo intervenga.

## Decisiones (2026-10-27)

- Aplica a los tres planes mensuales (Acompañamiento, Constancia, Transformación) en sus tres duraciones. Evaluación y Básico siguen como pago único.
- **Mes a mes:** pago mensual automático al precio normal, cancelable cuando quiera, sin penalidad.
- **Paquetes de 3 y 6 meses:** pago mensual automático al precio por mes del paquete (`porMes` de `duraciones.js`). El pago completo de hoy sigue igual como alternativa.
- **Sin renovación (Joaquín y Alejandro, 27-oct):** el paquete de 3 o 6 meses termina solo con su último cobro. El equipo recibe un aviso cuando un paciente entra a su último mes, para ofrecerle seguir. El mes a mes sigue cobrándose hasta que el paciente cancele.
- **Penalidad:** si cancela antes del último cobro del paquete, paga una vez el ahorro de un mes: `precio mes a mes − porMes del paquete`. Con los precios del 27-oct:

  | Plan | 3 meses | 6 meses |
  |---|---|---|
  | Acompañamiento (S/320) | S/270 · penalidad S/50 | S/250 · penalidad S/70 |
  | Constancia (S/440) | S/360 · penalidad S/80 | S/325 · penalidad S/115 |
  | Transformación (S/600) | S/510 · penalidad S/90 | S/468 · penalidad S/132 |

  Se calcula desde `plans.js`/`duraciones.js`, nunca escrita a mano.
- **Cuota pareja:** todos los cobros del paquete son iguales, desde el primero (se descartó cobrar la penalidad por adelantado como garantía porque sube el primer pago).
- **Cancelar mi plan (para que no convenga irse sin pagar, sin hacer difícil la baja):**
  - Cada recibo mensual trae «Cancelar mi plan», que abre una página nuestra con lo pagado, lo que falta y la penalidad.
  - «Pagar S/X y cancelar»: paga la penalidad en Mercado Pago (pago único, tarjeta o Yape) y, al confirmarse, el sistema cancela la suscripción en Mercado Pago. Sin intervención del equipo.
  - «Cancelar sin pagar ahora»: la suscripción se cancela igual y la penalidad queda pendiente. Darse de baja nunca depende de pagar (Indecopi: la baja debe ser tan fácil como el alta; confirmar con un abogado antes de publicar).
  - Si cancela desde su cuenta de Mercado Pago, o el cobro falla y Mercado Pago agota sus reintentos, la penalidad también queda pendiente y se avisa al equipo.
  - **Freno al volver:** quien tiene una penalidad pendiente (se busca por DNI) debe pagarla antes de reservar en /reservar/ o de activar un link de suscripción. Los links de agenda del equipo no se frenan: ahí decide el equipo.
- **Precio congelado:** cuota y penalidad se guardan al suscribirse. Si cambian los precios, los suscritos siguen con los suyos.
- **Entradas:** desde /reservar/ (con cita) y desde un link de suscripción que crea el equipo en el panel (sin cita; las citas se agendan con los links de agenda de siempre).
- **Integración:** suscripción de Mercado Pago sin plan asociado, con pago pendiente (`POST /preapproval`, el paciente autoriza en la página de Mercado Pago vía `init_point`). Una suscripción por paciente y paquete. Nuestra base cuenta los cobros y, al aprobarse el último del paquete, cancela la suscripción en Mercado Pago (además se manda `end_date` como respaldo). El mes a mes no lleva fecha de fin.

## Pantallas

Ver el diseño visual (8 pantallas). Resumen:

### /reservar/

- **Paso 2:** al elegir duración aparece «¿Cómo quieres pagar?»: «Pago mensual automático» (cuota al mes, N cobros y termina sin renovación, se cancela con un botón en cada recibo, penalidad si cancela antes del último cobro) y «Pago completo» (como hoy). En Mes a mes: «Pago mensual automático» sin penalidad, o pagar el mes una vez como hoy.
- **Paso 3:** sin cambios (elige hora; la retención de la hora funciona igual).
- **Paso 4:** el resumen muestra cuota, «hoy pagas», próximos cobros y la fecha del último. Casilla obligatoria aparte: «Acepto N cobros mensuales automáticos de S/Y y la penalidad de S/X si cancelo antes del último.» Botón «Suscribirme con Mercado Pago».
- **Página de Mercado Pago:** el `reason` de la suscripción dice «AJL Nutrición · Constancia, 3 meses» y el cobro en el estado de cuenta sale como `AJLNUTRICION`, para que el paciente lo reconozca. El nombre y el logo del vendedor salen de la cuenta de Mercado Pago de AJL (revisar que estén puestos).
- **Vuelta de Mercado Pago:** igual que hoy (`/reservar/listo/`), con el texto de suscripción. Si el primer cobro llegó tarde y la hora se liberó, queda `pagada_sin_hora` como hoy.

### Link de suscripción (`/suscribirse/?s=<token>`)

- Muestra nombre del paciente, plan, paquete, cuota, ahorro y «cómo funciona»; pide el correo (Mercado Pago lo exige) y la casilla de aceptación; botón «Suscribirme con Mercado Pago».
- Sirve una vez y vence a los 7 días, como los links de agenda.
- Si el DNI tiene una penalidad pendiente, primero pide pagarla.
- Al volver: «¡Listo! Tu suscripción está activa. Te escribimos por WhatsApp para agendar tu primera sesión.»

### Cancelar mi plan (`/suscripcion/cancelar/?s=<token>`)

- El token es de la suscripción y va en cada recibo; no pide login.
- Muestra plan, cobros pagados y pendientes, y la penalidad si quedan cobros. Botones: «Pagar S/X y cancelar», «Cancelar sin pagar ahora» y «Prefiero seguir con mi plan».
- En el último mes o en mes a mes no hay penalidad: un solo botón «Cancelar».
- Tras cancelar, correo de confirmación al paciente y aviso al equipo.

### Panel

- **«Cobrar con suscripción»:** nombre del paciente, plan, paquete (cada opción muestra cuota y penalidad). Crea el link; Copiar y Enviar por WhatsApp.
- **«Suscripciones»:** filtros Todas · Activas · Terminan este mes · Cobro fallido · Penalidad pendiente · Canceladas. Columnas: paciente (nombre, DNI), plan y paquete, mes del paquete («2 de 3»; «—» en mes a mes), cuota, próximo cobro (o fecha del fallo), estado y penalidad, acciones (WhatsApp, «Marcar penalidad pagada»).
- Cada cobro mensual también aparece en «Reservas» y sale en «Copiar para la base maestra» (producto, N = mes del paquete sobre el total, soles y neto).

### Correos

- **Al paciente:** confirmación de la suscripción; recibo de cada cobro con «Cancelar mi plan»; confirmación de la baja.
- **Al equipo** (`CORREOS_EQUIPO`): suscripción nueva; entra a su último mes («Lucía termina su plan el 3 ene»); cancelación con penalidad pagada (informativo); cancelación o cobro fallido con penalidad pendiente.

## Datos (D1, migración nueva)

- `suscripciones`: `id`, `token` (para el link y la vuelta), `cliente_id`, `reserva_id` (null si vino de link), `producto`, `duracion_meses` (1, 3 o 6), `cuota_centimos`, `penalidad_centimos` (0 en mes a mes), `mp_preapproval_id`, `estado` (`pendiente` · `activa` · `terminada` · `cobro_fallido` · `cancelada` · `vencida` si el link no se usó), `cobros_aprobados`, `proximo_cobro`, `aviso_ultimo_mes_en`, `cancelada_en`, `motivo_cancelacion` (`paciente_boton` · `paciente_mp` · `cobro_fallido` · `equipo`), `penalidad_estado` (`no_aplica` · `pendiente` · `pagada`), `penalidad_mp_payment_id`, `penalidad_marcada_por`, `dni` (para el freno al volver), `creado_por` (correo del equipo si vino de link), `creado_en`, `actualizado_en`, `acepto_condiciones_version`.
- `suscripcion_cobros`: `id`, `suscripcion_id`, `mp_payment_id` (único), `numero` (1, 2, 3…), `mes_paquete` (1..N), `estado`, `monto_centimos`, `neto_centimos`, `metodo`, `creado_en`.
- Mes del paquete = `numero` (sin renovación no se repite). Cancelar con `cobros_aprobados < duracion_meses` → penalidad; con todos pagados no hay nada que cancelar. Mes a mes nunca tiene penalidad.

## Servidor

- `server/suscripciones/calculo.mjs` (puro, probado sin red): cuota, penalidad, si corresponde penalidad, fechas de los cobros, del último y del aviso de último mes.
- `server/reservas/mercadopago.mjs` suma `crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, email, urlRetorno })` → `{ id, init_point }` (`auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount, currency_id: 'PEN' }`, `external_reference: suscripcionId`, `status: 'pending'`), `obtenerSuscripcion(id)`, `obtenerCobroSuscripcion(id)` y `cancelarSuscripcion(id)` (`PUT /preapproval/{id}` con `status: 'cancelled'`). La penalidad se cobra con `crearPreferencia` de hoy, `external_reference` = `pen-<suscripcionId>`.
- `/api/reservas/pagar` acepta `forma: 'mensual'`: crea la suscripción en vez de la preferencia. El monto lo calcula el servidor desde el catálogo; el navegador solo manda producto, duración y forma.
- `/api/suscripciones/link` (GET datos del link, POST crear la suscripción en MP desde el link) `/api/suscripciones/cancelar` (GET datos, POST `{ pagar: true }` crea la preferencia de la penalidad, POST `{ pagar: false }` cancela ya) y `/api/equipo/suscripciones` (crear link, listar, marcar penalidad pagada), con el acceso del panel.
- `/api/reservas/pagar` y el POST del link de suscripción consultan si el DNI tiene una penalidad pendiente y, si la hay, responden con los datos para pagarla primero.
- `/api/reservas/webhook-mp` reconoce los temas de suscripción (`subscription_preapproval`, `subscription_authorized_payment`), verifica la firma igual que hoy y vuelve a consultar el estado en la API (nunca confía en el cuerpo):
  - Preapproval `authorized` → suscripción `activa`.
  - Cobro aprobado → registra el cobro (idempotente por `mp_payment_id`); el primero confirma la reserva como hoy el pago único; el último del paquete marca `terminada` y cancela la suscripción en Mercado Pago.
  - Pago aprobado con `external_reference` `pen-…` → penalidad `pagada`, cancela la suscripción en Mercado Pago, correo al paciente y aviso al equipo.
  - Preapproval `cancelled` que no canceló nuestro sistema → `cancelada` (`paciente_mp`) con penalidad pendiente si quedaban cobros; aviso al equipo.
- Tarea diaria (el Worker `ajl-resumen-cron` que ya manda el resumen): aviso al equipo de quienes entran a su último mes; suscripciones cuyo cobro falló sin más reintentos (se cancela en MP y se marca `cobro_fallido` con penalidad si corresponde); links vencidos.

## Riesgos que se prueban en el modo de prueba de Mercado Pago antes de abrirlo

1. Que el primer cobro llegue en minutos tras autorizar (la hora se retiene 15 a 30 minutos). Si tarda, el flujo cae en `pagada_sin_hora` como hoy.
2. Que Yape y tarjeta de débito sirvan para cobros recurrentes en Perú.
3. Cómo informa Mercado Pago que agotó los reintentos de un cobro (estado del preapproval o del cobro) para detectarlo bien.
4. Si `payer_email` tiene que coincidir con la cuenta con la que el paciente paga.
5. Que el paciente pueda cancelar desde su cuenta y nos llegue el aviso.
6. Que `PUT /preapproval/{id}` con `cancelled` funcione desde nuestro servidor y que `end_date` corte la suscripción después del último cobro.

## Legal y textos

- Condiciones del servicio: sección nueva de pago mensual automático (número de cobros, sin renovación, cómo cancelar, penalidad por plan y que queda pendiente para volver a reservar). Versión nueva de `acepto_condiciones_version`.
- Política de privacidad: declarar los datos nuevos que guardamos (suscripción y cobros) si no están cubiertos por los del pago único.
- Libro de reclamaciones sin cambios.

## Fuera de alcance

- Cobro automático de la penalidad sin acción del paciente (requiere guardar su tarjeta aparte).
- Cambiar de plan o de paquete dentro de una suscripción (se cancela y se crea otra).
- Pausar o congelar una suscripción por viaje.
- Precios nuevos para los que ya están suscritos.

## Pruebas

- Unitarias de `calculo.mjs`: cuotas y penalidades de los 9 casos, penalidad sí/no según los cobros pagados al cancelar, fin del paquete en el último cobro.
- Handlers con Mercado Pago simulado: crear desde /reservar/ y desde link, webhooks fuera de orden y repetidos, primer cobro tarde (`pagada_sin_hora`), cancelar pagando y sin pagar, cancelación desde Mercado Pago, cobro fallido, freno por DNI con penalidad pendiente, último cobro que termina la suscripción, link vencido y reusado.
- Prueba manual en la versión de prueba con el modo de prueba de Mercado Pago antes de publicar.
