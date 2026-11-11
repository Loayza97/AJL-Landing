# Link de suscripción único: pagar y agendar con un solo link · diseño

Fecha: 2026-11-08 · Pedido de Alejandro · Rama `reservas-pago` · Estado: **pausa levantada el 10-nov-2026, no se construye tal cual.** La web cobra desde el 10-nov con la cuenta personal de Mercado Pago de Alejandro (RUC 10), así que el motivo de la pausa ya no existe. Pagar y agendar con un solo link ya lo hace «Mensual automático» del generador de links de reserva del panel, y «Mensual, ya tiene cita» cobra sin agendar (11-nov-2026). Este documento queda como referencia.

> **Pausa (Alejandro, 08-nov-2026).** La cuenta de Mercado Pago está a nombre del RUC 20 (FJ INVESTMENTS S.A.C.), pero AJL declara como RUC 10. Los cobros dejan constancia de ingresos de la empresa que no se declaran por ella. Mercado Pago sigue activo mientras tanto, porque hay que cobrar, pero se va a cambiar a **Culqi** apenas haya acceso. Ese mismo día, el soporte de Mercado Pago (caso 494261463) confirmó otra salida: crear una **cuenta nueva de Mercado Pago con el RUC 10 y otro correo**, porque la titularidad no se puede cambiar. Los pagos recurrentes se habilitan después de validar esa cuenta. Si la cuenta nueva trae Suscripciones, se queda Mercado Pago con credenciales nuevas y no hace falta Culqi. Este diseño se retoma con las particularidades de Culqi: suscripciones, avisos, estados de cobro y reintentos. Lo que depende de Mercado Pago (secciones «Saber cuándo se aprueba un cobro», «Mercado Pago: planes…» y la prueba de S/5) se rehace para Culqi.
>
> **Preguntas abiertas al pausar** (salieron de la revisión del documento):
> 1. Si el primer cobro se rechaza después de agendar: ¿cortar en el primer rechazo (cancelar la suscripción, alertar al equipo y mandar al paciente el link para pagar con otra tarjeta) o esperar los reintentos de la pasarela? Recomendación de Claude: cortar en el primer rechazo.
> 2. La marca «pago por confirmar»: el evento de Google es uno solo, compartido con el paciente, y con `sendUpdates=all` cada cambio le manda un correo. Opciones: un evento aparte solo para el equipo y la nutricionista («⚠️ Revisar pago de X antes de atender»), o un texto suave en el evento del paciente sin aviso. Recomendación de Claude: el evento aparte.
>
> **Decisiones de Claude tras la revisión** (para que Alejandro las revise):
> - Solo se agenda si la pasarela confirma que la suscripción quedó autorizada. Que no informe nada no alcanza: si no, alguien podría abrir el pago, cerrarlo sin pagar y agendar. Esto **reemplaza** la decisión del final del documento sobre los 2 minutos sin respuesta.
> - El flujo nuevo aplica solo a los links creados después de publicarlo. Las suscripciones anteriores se unen a sus citas con la corrección de datos aparte.

Se apoya en `2026-10-27-suscripciones-design.md` (suscripciones) y `2026-10-12-links-agenda-design.md` (links de agenda). Lo que no se menciona aquí sigue como dicen esos dos.

## Por qué

Hoy, cuando el equipo cobra una suscripción por link, el paciente pasa por dos links y llena datos dos veces:

1. **Link de suscripción** (`/suscribirse/?l=…`): pide correo, documento, WhatsApp y la casilla de condiciones. Paga en Mercado Pago. Al volver ve «Te escribimos por WhatsApp para agendar».
2. **Link de agenda** (`/agenda/?l=…`): el equipo lo crea aparte y se lo manda por WhatsApp. Vuelve a pedir DNI, correo, WhatsApp, más nombres, apellidos y fecha de nacimiento, y otra vez la aceptación de condiciones.

Además, del 04 al 08-nov-2026 aparecieron tres problemas en producción:

- **La web no se entera cuando un primer cobro pendiente se aprueba.** De 5 primeros cobros, 2 (Josué y Oscar) quedaron pendientes. Mercado Pago mandó `payment.created` mientras estaban pendientes y **nunca mandó un aviso al aprobarse**. Lo verificamos en su historial de webhooks: «Pagos» y «Planes y suscripciones» están marcados en modo productivo, y aun así en 7 días solo hubo 2 avisos `payment.created`, ninguno de suscripción y ningún `payment.updated`. Solo se activaron cuando Alejandro tocó «Sincronizar», 22 y 29 horas después. Conclusión: los avisos de Mercado Pago no son confiables para suscripciones y la web tiene que preguntar ella misma.
- **Duplicados.** Como Josué no se confirmaba, el equipo le creó un link de agenda aparte, y su reserva de la web quedó duplicada (32a5ce35, «pagada sin hora»).
- **El panel muestra mal el pago.** Toda cita agendada con link sale como «Pagó por fuera», sin monto ni neto (`server/handlers/equipo-links.mjs:161`), aunque la haya pagado una suscripción.

## Objetivo

Un solo link para el paciente. Paga, llena sus datos una sola vez y agenda su primera sesión **de inmediato**, sin esperar a que Mercado Pago apruebe el cobro. Y nadie se atiende sin que su pago esté confirmado.

**Cómo se ve el éxito.** Oscar recibe por WhatsApp un link. Ve el resumen de Constancia 3 meses (S/360 al mes), escribe su correo, marca la casilla y paga. Al volver, llena nombres, apellidos, WhatsApp, DNI y fecha de nacimiento (el correo ya viene escrito), elige modalidad, nutricionista y hora para su sesión de 1 hora («cita 1 de 7»), y recibe la confirmación. Si su cobro quedó en revisión, en el calendario de la nutricionista la cita dice «⚠️ PAGO POR CONFIRMAR», hasta que la web ve el pago aprobado y la marca se quita sola. En el panel, su cita dice «S/360 · Suscripción Mercado Pago · cobro 1 de 3», con el neto. Nadie del equipo tuvo que hacer nada.

## No es objetivo

- Cambiar `/reservar/` (la reserva web con pago). Solo recibe los arreglos de sincronización de la sección «Saber cuándo se aprueba un cobro».
- Cambiar los links de agenda de quien paga por fuera (transferencia, Yape, en persona). Siguen igual y siguen diciendo «Pagó por fuera».
- Un Worker nuevo o una tarea programada nueva. Alejandro no quiere más procesos corriendo solos. Se usa el Worker `ajl-resumen-cron` que ya existe, sin agregarle horarios.
- Mandar el link del Meet solo con pago aprobado. Se descartó (Alejandro, 08-nov): no tiene que ser un freno tan grande.

## Lo que no puede pasar (anti-objetivos)

- **Atender a alguien cuyo pago no pasó.** Es la preocupación principal de Alejandro. Ver «Seguros contra atender sin pago».
- Que un pago **rechazado** permita agendar.
- Que una suscripción termine con dos citas para la misma primera sesión (lo que pasó con Josué).
- Volver a pedirle al paciente un dato que ya dio en el mismo link.

## Decisiones de Alejandro (08-nov-2026)

1. **Un solo link para el paciente.** Primero paga y después agenda. No se manda un segundo link.
2. **Antes de pagar, lo mínimo:** resumen del plan, **correo** y la **casilla de condiciones**. El correo se queda porque Mercado Pago no nos da el de quien paga, y el recibo con «Cancelar mi plan» tiene que llegarle apenas se apruebe el cobro. La casilla se queda porque es el consentimiento a los cobros mensuales y a la penalidad.
3. **Agendar de inmediato, sin esperar la aprobación.** Al volver de Mercado Pago:
   - **Aprobado** → agenda.
   - **En revisión o pendiente** (o Mercado Pago todavía no informa nada) → agenda igual, con la cita marcada «pago por confirmar».
   - **Rechazado** → no agenda. Ve «tu pago no pasó» y la opción de intentar con otra tarjeta.
4. **Seguros contra atender sin pago:** la marca en el calendario y la revisión de las 8 a. m. (ver abajo). Sin el seguro del Meet.
5. **El link se retoma.** Si el paciente se va después de pagar y antes de agendar, el mismo link lo lleva a donde quedó, aunque pasen días. Si se pierde, el equipo le reenvía el mismo link.
6. **Revisión de deuda después del pago.** Como ya no se pide el DNI antes de pagar, la revisión de penalidad pendiente se hace cuando lo escribe al agendar. Si tiene deuda, **igual agenda** y al equipo le llega una alerta.
7. **El panel muestra el pago real** de las citas que vienen de una suscripción.
8. **Prueba real de S/5** solo en el sitio de prueba, reactivando ahí el plan interno `prueba`, e incluyendo una tarjeta que no pase.
9. **Sin Worker nuevo** (ver «No es objetivo»).

## El flujo del paciente (`/suscribirse/?l=<token>`)

Una sola dirección. La página decide qué mostrar según en qué punto está la suscripción:

| Estado | Lo que ve |
|---|---|
| Sin pagar | Resumen (plan, cuota, cobros, ahorro, «cómo funciona»), correo, casilla de condiciones y «Pagar con Mercado Pago». |
| Volviendo de Mercado Pago | «Estamos confirmando tu pago…» mientras consulta a Mercado Pago, **hasta 2 minutos**. |
| Rechazado | «Tu pago no pasó. Intenta con otra tarjeta» y el botón que vuelve a abrir Mercado Pago (el reintento que ya existe, con un plan nuevo). |
| Aprobado o en revisión, sin cita | El formulario de datos y el calendario del link de agenda (ver abajo). |
| Con cita | Su cita (fecha, hora, modalidad, nutricionista, Meet si es virtual) y «Agregar a mi calendario». |
| Link vencido sin pagar | Lo de hoy: «Este link ya no sirve. Pídele uno nuevo al equipo». |

**Datos y calendario.** Se reutiliza la página y la lógica de los links de agenda (`/agenda/`, `server/handlers/agenda.mjs`). Cambia esto:

- El tipo es `s60` (sesión de 1 hora), el plan es el de la suscripción (`producto:meses`) y la cita es la 1. Vienen dados, no se eligen.
- El correo viene escrito con el que dio al pagar. Puede corregirlo, y se guarda el corregido.
- No vuelve a pedir la aceptación de condiciones: ya la dio al pagar (se guarda la versión aceptada).
- Pide nombres, apellido paterno, apellido materno, WhatsApp, DNI y fecha de nacimiento. Si el DNI ya es paciente, aplica el atajo de hoy (confirmar con el correo y el WhatsApp enmascarados).

**Vencimiento.** El link vence a los 7 días **solo si no se pagó**. Una vez pagado, sirve hasta que agenda, sin límite. Después de agendar sigue abriendo y muestra la cita.

## Cómo queda unido todo (para el panel y para evitar duplicados)

- Cada suscripción que viene de un link tiene **a lo sumo una** cita de primera sesión hecha por este flujo. Si ya tiene una, el link muestra la cita y no deja agendar otra.
- La cita guarda de qué suscripción viene. En el panel (`vistaAgendado`), una cita así muestra:
  - **Pago:** la cuota (por ejemplo S/360) y el detalle «Suscripción Mercado Pago · cobro 1 de 3», con el medio de pago si Mercado Pago lo informa.
  - **Neto:** el neto del primer cobro de la suscripción, en los mismos campos que usan hoy las reservas web (`neto`, `neto_soles`), para la base maestra.
  - **Origen:** «Link de suscripción de <quien lo creó>».
  - **Marca «Pago por confirmar»** mientras el primer cobro no esté aprobado.
- En **Suscripciones**, cada fila muestra en qué punto va: «Esperando pago», «Pagó · falta agendar», «Agendado · <fecha>» o «Pago por confirmar · <fecha>».

## Seguros contra atender sin pago

1. **El calendario dice la verdad.** Mientras el primer cobro no esté aprobado, el evento de Google se llama **«⚠️ PAGO POR CONFIRMAR · <nombre> · Sesión de 1 hora»**. Cuando la web ve el cobro aprobado, cambia el título al normal. La marca **solo se quita con una aprobación confirmada por la API de pagos** de Mercado Pago, nunca por suponer. Regla para el equipo: con esa marca no se atiende sin antes confirmar el pago.
2. **Revisión a las 8 a. m.** El resumen diario (`/api/reservas/resumen-diario`, disparado por `ajl-resumen-cron`) también:
   - consulta a Mercado Pago cada cita «por confirmar» de **hoy y mañana** y actualiza su estado y su título en el calendario;
   - si alguna sigue sin aprobar, la pone **al inicio del correo y en rojo**: «Hoy 3 p. m., Oscar, pago sin confirmar: escribirle antes de atender»;
   - manda el correo aunque no haya «no pagadas» del día. Hoy el resumen no manda nada si esa lista está vacía, y eso hay que cambiarlo cuando haya citas por confirmar.
3. **Si el primer cobro se rechaza después de agendar:** al equipo le llega una alerta con el nombre, la cita y el WhatsApp. Al paciente le llega un correo con su link para pagar con otra tarjeta. **La cita no se cancela sola: decide el equipo.**
4. **Cláusula nueva en las condiciones:** «Si agendas con tu pago en revisión y tu pago no se aprueba, tu cita queda sin efecto». Va en `/condiciones/` y en el resumen de 6 puntos, y sube `CONDICIONES_VERSION`.

**Riesgo que queda, aceptado por Alejandro:** si un pago se rechaza tarde, la hora queda ocupada hasta que el equipo actúa (a más tardar lo ve en el resumen de las 8 a. m.). Un pago aprobado después de las 8 a. m. deja la marca puesta aunque ya se pagó. Es un falso aviso del lado seguro: se resuelve con «Sincronizar».

## Saber cuándo se aprueba un cobro (sin depender de los avisos)

La web consulta a Mercado Pago en los momentos en que alguien entra igual:

1. **Cuando el paciente abre o recarga su link.** Esto incluye la espera de 2 minutos al volver de Mercado Pago.
2. **Cuando alguien del equipo abre el panel de Suscripciones o Agendados.** Se sincronizan solas las suscripciones con el primer cobro sin aprobar o con citas «por confirmar», sin tocar «Sincronizar». El botón «Sincronizar» se queda. No debe hacer lenta la carga del panel; cómo lograrlo queda para quien construye (ver abajo).
3. **A las 8 a. m.,** con el resumen diario (seguro 2).
4. **Los avisos de Mercado Pago** se siguen procesando como hoy, como camino extra cuando llegan.

Esto también aplica a las suscripciones que vienen de `/reservar/` con pago mensual (el caso de Josué). Ese flujo no cambia: solo se entera antes.

Cuando la web detecta la aprobación, pasa lo mismo que hoy: el recibo al paciente con «Cancelar mi plan», el correo «Suscripción nueva: <nombre>» al equipo y la desactivación del plan en Mercado Pago. Lo nuevo es que, además, quita la marca del calendario.

## Mercado Pago: planes ordenados y planes manuales

- **El nombre del paciente en el título del plan:** «AJL Nutrición · Oscar · 2 sesiones al mes · 3 meses · pago mensual». Así se distingue en «Planes de suscripción» de Mercado Pago. Lo ve el paciente al pagar, y es su propio nombre.
- **Limpieza:** el plan de un link que vence sin pagar se desactiva en Mercado Pago. Se hace en uno de los momentos de consulta (panel o 8 a. m.), no con un proceso aparte.
- **Planes manuales de Alejandro** («3 meses - 2 sesiones mes», «3 meses- 1 sesión mes», «6 meses - 2 sesiones mes», con unos 9 clientes activos): la web no los administra. Hoy, un cobro aprobado de un plan que la web no conoce dispara una alerta que dice «devuelve ese pago» (`avisarPlanDesconocido` en `server/suscripciones/procesar.mjs`). Revisamos el correo desde el 20-oct y nunca se mandó, pero puede pasar. Se cambia así:
  - **un plan que no está en `suscripcion_planes`** (manual, o de otro sitio como el de prueba) se ignora y solo queda registrado en el log;
  - **un cobro de un plan nuestro reemplazado** (reintento) sigue alertando como hoy.

## Prueba real de S/5 (solo sitio de prueba)

- Reactivar el plan `prueba` (S/5, 3 cobros) **solo en el sitio de prueba**. En producción sigue bloqueado (`equipo-suscripciones.mjs:34-35`).
- Las suscripciones no tienen una dirección de aviso propia, así que los avisos de la prueba llegan a **producción**. Antes de la prueba, producción ya tiene que tener el cambio de «planes que no conoce se ignoran», para no disparar la alerta de «devuelve ese pago».
- Casos a probar con plata real:
  1. Pago aprobado al instante → agenda; el panel muestra S/5, el cobro 1 de 3 y el neto.
  2. Tarjeta que no pasa (por ejemplo, débito sin saldo) → ver qué estado devuelve Mercado Pago y cuánto tarda. Si el rechazo llega tarde y no al instante, revisar la regla 3 de las decisiones con Alejandro.
  3. Irse después de pagar y volver al link → retoma.
  4. Abrir el panel con un cobro pendiente → se sincroniza solo.
- Mientras tanto, mirar en vivo los registros de producción y del sitio de prueba, para ver qué avisos manda Mercado Pago de verdad.
- Al terminar: cancelar las suscripciones de prueba en Mercado Pago, borrar las filas y eventos de prueba y volver a bloquear `prueba`.

## Corrección de datos en producción (aparte, con OK de Alejandro)

- Unir a su suscripción las citas que ya agendaron con link Oscar, Fio, Josué y los demás, para que el panel muestre su pago real.
- Marcar como cancelada la reserva web duplicada de Josué (32a5ce35).
- Antes de escribir, mostrarle a Alejandro las filas exactas. Es escritura en la base de producción.

## Pruebas automáticas

Las pruebas tienen que cubrir, sin red (con el Mercado Pago falso que ya usan las pruebas):

- cada fila de la tabla del flujo del paciente;
- que el rechazo no deja agendar;
- que el link pagado no vence;
- que no se puede agendar dos veces;
- la marca del calendario: se pone con pendiente y se quita solo con un aprobado de la API de pagos;
- la revisión de las 8 a. m.: actualiza el estado, avisa en rojo y manda el correo aunque no haya «no pagadas»;
- la sincronización al abrir el panel;
- la vista del panel con el pago de la suscripción;
- los planes desconocidos ignorados sin alerta, y la alerta de reemplazados que se mantiene;
- la deuda por DNI al agendar: alerta y agenda igual;
- el correo prellenado y la casilla que no se repite.

## Lo que queda para quien construye

- Cómo se guarda la unión cita ↔ suscripción (columna nueva en `links_agenda` o en `reservas`) y si el flujo crea por dentro una fila de `links_agenda` o no. Lo que importa es lo de «Cómo queda unido todo».
- Cómo sincronizar al abrir el panel sin hacerlo lento: en segundo plano con `waitUntil`, con un tope de suscripciones por carga, o lo que convenga.
- El texto exacto de las pantallas y correos nuevos, siguiendo el tono de los que ya existen.
- Cómo se cambia el título del evento de Google (la ruta de actualización que ya existe en `server/reservas/google.mjs`).
- Si la espera de 2 minutos al volver de Mercado Pago consulta cada 5 o cada 10 segundos.

## Decisiones que tomé yo (Claude), para que Alejandro las revise

- El correo se puede corregir en el paso de datos y se usa el corregido de ahí en adelante.
- Si al volver de Mercado Pago no hay ninguna respuesta en 2 minutos, se trata como «en revisión» y deja agendar. Es lo coherente con «agendar sin esperar», y la prueba de S/5 lo confirma o lo cambia.
- La revisión de las 8 a. m. mira las citas de hoy y mañana, no todas.
- El link pagado no vence nunca mientras falte agendar.
