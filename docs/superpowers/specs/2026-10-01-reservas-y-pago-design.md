# Reserva y pago en la web · V1

**Fecha:** 2026-10-01 · **Estado:** diseño aprobado por Joaquín, por partes (1 a 4)
**Fuente:** el handoff de Alejandro del 30-sep (mockup P1–P8, decisiones D1–D7, horarios de nutricionistas), guardado fuera del repo en `~/ajl/reservas-handoff/` porque este repo es público. Donde el handoff se contradice, manda lo que se decidió en esta conversación y queda anotado abajo.

## Objetivo

Que el paciente elija su acompañamiento, su duración y su primera hora, pague en Mercado Pago y salga con la cita confirmada en el calendario del equipo, sin que nadie intervenga. Menos conversaciones de WhatsApp para cerrar una venta.

## Alcance

**Entra en V1:** pantallas P1 a P6 del mockup.
- P1 acompañamiento (1, 2 o 4 sesiones al mes; sesión única S/250 y evaluación S/80 abajo, con menos peso).
- P2 duración (3 meses marcado, o mes a mes). Se muestra el plazo y el congelamiento antes de pagar.
- P3 primera sesión: modalidad (video o Lince), día y hora; la nutricionista se asigna sola y se ve su cara; filtro opcional por nutricionista.
- P4 datos: nombre, WhatsApp, correo; DNI solo si el total supera S/700; casilla obligatoria de condiciones y casilla opcional de novedades.
- P5 Mercado Pago Checkout Pro.
- P6 confirmación.
- Página de condiciones del servicio (`/condiciones/`).
- Política de privacidad v1.4.

**Fuera de V1:** ficha clínica (P7), portal «Mi acompañamiento» (P8) con congelamiento y reprogramación, marca «plan entregado», Chatwoot, WhatsApp automático de confirmación, cuotas sin intereses (hasta conocer su costo), paquetes de 6 meses, membresía con débito, transferencia bancaria, crédito automático de la evaluación de S/80 contra un plan, panel de administración. Mover o cancelar una cita en V1 sigue siendo por WhatsApp.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Orden del flujo | Elige hora **antes** de pagar (manda el handoff sobre la idea previa de pagar primero) |
| Disponibilidad | Horarios semanales por nutricionista (archivo del repo) menos lo ocupado en Google Calendar menos las reservas web |
| Consultorio | Uno solo en Lince: una sesión presencial a la vez. Las videollamadas pueden ir en paralelo, cada una con su nutricionista |
| Tope diario | Opción A: máximo **3 primeras sesiones por día**, todos los canales. Plan o sesión única = 1; evaluación = 0,5. Se permite reservar si `suma + peso ≤ 3` |
| Datos del paciente | Nombre, WhatsApp, correo; DNI si el total supera S/700 |
| Medios de pago | Solo Mercado Pago: tarjeta, Yape, dinero en cuenta. PagoEfectivo excluido. Una sola cuota hasta decidir D2. Sin recargo |
| Transferencia | No en V1. Quien insista escribe por WhatsApp. Se mide cuántos lo piden |
| Infraestructura | Dentro de la landing, en Cloudflare Pages + D1. Sin Supabase para este sistema |
| Google Calendar | Gmail normal (`alejandro.loayza.jordan@gmail.com`, calendario «AlejandroJLoayza Nutrición»). Sin Workspace: se usa OAuth con autorización única de Alejandro |
| Condiciones del servicio | Las redacta Claude con las decisiones de Alejandro; se publican y, si un abogado las revisa después, se ajustan |

## Arquitectura

- Páginas Astro en `src/pages/reservar/` (flujo P1–P6) y `src/pages/condiciones/`.
- Funciones en `functions/api/reservas/*.js` con lógica en `server/reservas/*.mjs`, mismo patrón de la migración (handlers puros, dependencias inyectadas, `node:test`).
- Base de datos **Cloudflare D1** (binding en `wrangler.toml`; migraciones SQL versionadas en `db/d1/`).
- Precios desde `src/data/plans.js`. El servidor recalcula siempre el monto; nunca confía en el navegador.
- Horarios de nutricionistas en `src/data/nutricionistas.js` (nombres, apodos, foto, ventanas por día y modalidad, alternancias).
- Servicios externos: Mercado Pago Checkout Pro, Google Calendar API (OAuth con refresh token guardado como secreto), Resend.
- Zona horaria del negocio: `America/Lima` (UTC−5, sin horario de verano). Se guarda en UTC.
- Secretos nuevos (vía `wrangler pages secret put`): `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` (secreto y no texto porque el repo es público; el preview apunta a un calendario de pruebas y a su propia base D1, corregido al escribir el plan).

## Disponibilidad

**Cuadrícula:** inicios en hora en punto, bloques de 60 min. La evaluación de 30 min también bloquea 60 (30 de colchón). Se ofrece desde mañana hasta 21 días adelante (constantes configurables).

**Nutricionistas y ventanas** (del handoff):

| Nutricionista | Apodos | Ventanas |
|---|---|---|
| Nico | nico | L, M, J presencial 11–20; V video 11–20; X y S presencial 11–20 **alternados cada dos semanas** |
| Paola | paola | L video 14–20; X, V presencial 14–20; S presencial 10–19 |
| Jussara | jussara, yuyu | L–V presencial 10–17; S presencial 9–13 |
| Paolo | paolo | L, M presencial 14–20; J presencial 10–17; V video 14–20; **S pendiente** (no se ofrece) |

Alternancia de Nico: viene el **miércoles 7-oct-2026** y no el sábado 10-oct; la semana siguiente al revés, y así. (Referencia: el miércoles 30-sep no vino.)

Una hora se ofrece a una nutricionista si cae dentro de su ventana para ese día y modalidad, y **ninguna** de estas reglas la bloquea:

1. **Consultorio:** si es presencial y ya existe una reserva web presencial (apartada o confirmada) a esa hora.
2. **Eventos con hora del calendario** que no fueron creados por el sistema: bloquean esa hora para todas las nutricionistas y ambas modalidades (no dicen quién atiende).
3. **Ausencias:** un evento de día completo cuyo título contiene, como palabra completa y sin importar mayúsculas ni tildes, un nombre o apodo de nutricionista, la saca ese día. «nico viene» es la excepción explícita: si el título contiene «viene» y no «no viene», no la saca. Un evento de día completo con «cerrado» o «feriado» cierra la clínica.
4. **Reservas web** de esa nutricionista a esa hora (apartadas o confirmadas).
5. **Tope de primeras sesiones:** suma del día = reservas web confirmadas o apartadas (con su peso) + eventos manuales cuyo título empieza con «1ra» (peso 1). Si `suma + peso de lo que se quiere reservar > 3`, no se ofrece.

Los eventos que crea el sistema llevan una marca privada (`extendedProperties.private.ajl_reserva_id`) y no se cuentan dos veces.

**Asignación:** entre las nutricionistas libres, la que tiene menos reservas web ese día; empate por orden fijo. Con filtro, solo esa nutricionista.

**Retención:** al elegir hora, 15 minutos. Al tocar «Pagar», 15 más (30 en total). Si la hora se ocupó, se informa y se ofrecen las más cercanas.

**Lectura del calendario:** `events.list` del rango pedido, con caché corta (60 s) para no pegarle a Google en cada clic.

## Pago y confirmación

1. P4 envía los datos. El servidor valida, recalcula el monto, guarda o actualiza el cliente y extiende la retención.
2. Crea una preferencia de Checkout Pro:
   - `external_reference` = id de la reserva.
   - Vencimiento = fin de la retención.
   - Excluye PagoEfectivo y medios en efectivo; `installments` = 1.
   - `back_urls` a `/reservar/listo/?r=<token>` y `notification_url` al webhook.
3. **Webhook:**
   - Verifica la firma `x-signature` con `MP_WEBHOOK_SECRET`.
   - Consulta el pago a la API de MP con el token.
   - Es idempotente por `mp_payment_id`.
4. **Aprobado con la hora vigente:**
   - La reserva queda `confirmada`.
   - Se crea el evento con título `1ra · <Nombre> · <Plan>` (o `Eval · …` si es la evaluación, que suma 0,5).
   - Presencial: dirección de Lince. Video: Meet (`conferenceDataVersion=1`).
   - El paciente queda como invitado, con `sendUpdates=all`.
   - Correo al paciente y aviso al equipo (`NOTIFICATION_EMAIL`).
5. **Aprobado sin hora** (pagó tarde y la hora se ocupó):
   - Estado `pagada_sin_hora`.
   - Correo al paciente con un link privado para elegir otra hora sin volver a pagar, más aviso al equipo.
6. **Rechazado:** la retención sigue hasta vencer; P6 ofrece reintentar.
7. **Pendiente:** P6 muestra «Estamos confirmando tu pago».
8. **Si Google Calendar falla** tras un pago aprobado:
   - La reserva queda confirmada igual, con `calendario_pendiente`.
   - El equipo recibe un correo para crear el evento a mano.
9. **P6** consulta el estado por el token y muestra solo lo confirmado, con «Agregar a mi calendario» (.ics).
10. **Respaldo si el webhook no llega:** al volver de MP con `payment_id`, el servidor consulta ese pago y procesa lo mismo que el webhook (misma idempotencia).
11. **Devoluciones:** manuales desde el panel de MP.

## Datos (D1)

```
clientes(id, nombre, whatsapp, email, dni NULL, creado_en)
reservas(id, token, cliente_id, producto, duracion_meses, monto_centimos,
         peso_tope, nutricionista_id, inicio_utc, modalidad,
         estado, retencion_hasta, mp_preference_id, google_event_id,
         acepto_condiciones_version, novedades_optin, creado_en, actualizado_en)
pagos(id, reserva_id, mp_payment_id UNIQUE, estado, monto_centimos, metodo, creado_en)
```

- `estado` ∈ `apartada`, `pagando`, `confirmada`, `pagada_sin_hora`, `expirada`, `cancelada`.
- **Choques imposibles por construcción:**
  - Índice único parcial sobre `inicio_utc` para `modalidad='presencial'` en estados activos.
  - Índice único parcial sobre `(nutricionista_id, inicio_utc)` en estados activos.
  - El tope se aplica en un solo `INSERT … SELECT … WHERE suma + peso <= 3`.
  - Las retenciones vencidas se marcan `expirada` en el mismo lote antes de insertar.
- Las reservas nunca pagadas borran nombre, WhatsApp, correo y DNI a los 30 días (tarea programada o al leer).

## Legal

- **Política de privacidad v1.4,** el mismo día del lanzamiento:
  - Finalidad nueva: gestión de reservas y pagos, con base legal en la ejecución del contrato.
  - Proveedores nuevos: Mercado Pago (pago) y Google (calendario e invitación).
  - Se corre `docs/legal/checklist-nuevo-procesador.md` para ambos.
- **P4:** casilla obligatoria de condiciones (se guarda la versión aceptada) y casilla opcional de novedades (texto versionado, como el newsletter).
- **`/condiciones/`** la redacta Claude a partir de:
  - D1: misma nutricionista idealmente.
  - D5: mover gratis hasta 48 h antes; después o por inasistencia, S/80.
  - D6: si AJL no puede prestar el servicio, devuelve lo no usado.
  - El plazo: 3 meses con 1 semana de congelamiento.
  - Precios sin recargo.
  - El enlace al Libro de Reclamaciones.

  Sin cláusulas de no devolución absoluta.
- La medición de la compra (píxel, GA4, tabla de conversiones) respeta el Consent Mode actual, y la política lo declara.

## Pruebas

- **Motor de disponibilidad:** función pura (horarios + eventos + reservas + fecha → horas libres), con pruebas para:
  - la alternancia de Nico,
  - Paolo sin sábado,
  - ausencias por nombre y apodo («yuyu»), sin confundir Paola con Paolo,
  - «cerrado» y «feriado»,
  - consultorio único,
  - eventos manuales,
  - tope con evaluación,
  - los bordes de la ventana,
  - la zona horaria.
- **Pago:** firma del webhook (válida, inválida, ausente), idempotencia, aprobado, aprobado tarde, rechazado, pendiente y respaldo sin webhook.
- **Concurrencia:** dos reservas a la misma hora contra D1 local (wrangler), y solo una gana.
- **Antes de lanzar,** en el modo de prueba de MP: las pruebas del handoff (Yape con más de S/500, pago tardío, doble venta con dos navegadores, webhook que no llega, consentimiento) y un pago real de bajo monto.

## Dependencias

1. **Credenciales de Mercado Pago** (la cuenta ya existe): de prueba y de producción, más el secreto del webhook.
2. **Proyecto de Google Cloud** con la API de Calendar y OAuth en modo «En producción». Alejandro autoriza una vez.
3. **Convención del equipo:** las primeras sesiones agendadas a mano empiezan con «1ra»; las ausencias, como evento de día completo con el nombre o apodo.

## Pendientes conocidos (no bloquean V1)

- Sábado de Paolo.
- D2: costo de las cuotas sin intereses.
- Precios de 6 meses.
- Que Alejandro confirme el tope opción A.
- Apodos de Nico, Paola y Paolo, si los hay.
- Fotos reales del equipo.
- El repo es público: conviene volverlo privado, porque ahora tendrá más lógica del negocio. Cloudflare Pages funciona igual.
