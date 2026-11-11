# Datos de pago, advertencias, rechazos y generador de links

**Estado:** aprobado por Alejandro el 10-nov-2026 («de acuerdo con todo… constrúyelo y lánzalo a producción»). Mockup: https://claude.ai/artifact/3CUYzGKwdQMwdzzHoUPViz (versión B).

## Por qué

Con la cuenta personal de Mercado Pago (10-nov-2026), 6 de 13 intentos fueron `cc_rejected_high_risk`. Soporte (caso 494696561) recomendó:
- mandar los datos completos del comprador y del servicio;
- el Device ID;
- que el paciente pague desde su dispositivo y su red, entre con su cuenta, revise las compras por internet y el cupo, y no reintente enseguida;
- ofrecer otro medio de pago si falla.

Los datos que recibe Mercado Pago tienen que ser los de **quien paga** (los que coinciden con la tarjeta), no los del paciente: muchas veces paga un familiar.

## Qué cambia

### Paso 4 de /reservar: «Datos de pago»
- Arriba van los datos de quien paga: nombres, apellidos, documento, WhatsApp y correo («aquí llega tu comprobante»).
- Luego, la casilla «La sesión es para mí», **marcada por defecto**.
  - **Marcada:** se pide solo «Tu fecha de nacimiento», y el paciente es quien paga.
  - **Desmarcada:** se despliega «¿Para quién es la sesión?» con nombres, apellidos, fecha de nacimiento, documento y correo opcional del paciente. Si no pone correo, la invitación le llega a quien paga.
- Antes del botón van 4 advertencias:
  1. pagar desde tu dispositivo y tu red;
  2. tener activas las compras por internet y cupo suficiente;
  3. entrar con tu cuenta de Mercado Pago, o pagar con Yape;
  4. si te rechazan, no repetir enseguida.
- En pago mensual se agrega la nota «solo tarjeta».
- Todo se pide antes de pagar, para que el pago nunca quede sin paciente. La versión A (pedir el paciente después de pagar) se descartó por eso.

### Datos y correos
- **Base:** la ficha (`clientes`) guarda las columnas `pagador_*` y `paciente_es_pagador`. Los campos de siempre son los del paciente.
- **Mercado Pago:** en el pago único, la preferencia lleva el `payer` de quien paga (nombre, apellidos, correo, teléfono peruano, y documento si es DNI o CE numérico). Si Mercado Pago rechaza esos datos, se pide otra vez sin ellos. El 10-nov se comprobó que el correo no obliga a iniciar sesión.
- **Suscripción:** guarda los datos de quien paga (recibos, «Cancelar mi plan», penalidad).
- **Deuda previa:** se revisa por el DNI del paciente y por el de quien paga.
- **Correos:**
  - la invitación y la confirmación (con Meet) van al correo del paciente, o al de quien paga si no hay;
  - si quien paga tiene otro correo, también recibe la confirmación;
  - los recibos mensuales van a quien paga;
  - el correo al equipo incluye a quien paga cuando es otra persona.
- **Device ID:** el script `security.js` (`view="checkout"`) va en /reservar. `MP_DEVICE_SESSION_ID` viaja en `/pagar`, y el servidor lo manda en el header `X-meli-session-id` al crear la preferencia.

### Rechazo (/reservar/listo)
- **El mensaje según el motivo real (`status_detail`):**
  - `high_risk`: «filtro de seguridad de Mercado Pago, no tu banco»;
  - saldo insuficiente, datos mal escritos, autorizar con el banco o tarjeta deshabilitada: su propio texto.
- Una lista de qué revisar, y el número de operación.
- **Botones en pago completo:**
  - «Volver a pagar (Yape u otra tarjeta)», con el mismo horario;
  - «Pagar por WhatsApp (Yape o transferencia)», que abre el 919 151 237 con el plan, el horario y el número de operación.
- **Botones en pago mensual:**
  - «Intentar con otra tarjeta»;
  - «Pagar todo de una vez (acepta Yape)», que va a /reservar con el mismo plan en pago completo;
  - WhatsApp.

### /suscribirse
- Las mismas advertencias antes del botón.

### Panel
- **«Generar link de reserva»:** tres selectores en lugar de la tabla de 11 links.
  - plan: 1, 2 o 4 sesiones al mes, Una sola sesión o Evaluación;
  - duración: 1, 3 o 6 meses;
  - forma de pago: «Un solo pago» o «Mensual automático» (se apaga con 1 mes, con las sueltas y si el pago mensual está cerrado).
  - Botones «Copiar» y «Enviar por WhatsApp».
  - El link es el mismo de siempre (`/reservar/?plan=…&meses=…[&forma=mensual]`). Generarlo no crea nada en Mercado Pago.
- **«No pagaron»:** muestra el último intento de pago, con el motivo real en palabras y el número de operación con «Copiar». También muestra a quien paga cuando es otra persona.
- **Motivo guardado:** `pagos.detalle` y `suscripcion_cobros.detalle` guardan el `status_detail`.

## Fuera de alcance
- La limpieza automática de planes abandonados (decisión de Alejandro, 10-nov).
- Cobrar por transferencia dentro de la web. Lo resuelve el equipo por WhatsApp, y la cita se agenda con los links de agenda del panel.
- 3DS: en Checkout Pro lo decide Mercado Pago.

## Reglas internas de prueba (también en AGENTS.md)
- Nunca con tarjetas de Alejandro.
- Nunca desde su wifi ni su dispositivo: otra persona, con sus datos móviles.
- Tras un rechazo de prueba, esperar 30 minutos.
