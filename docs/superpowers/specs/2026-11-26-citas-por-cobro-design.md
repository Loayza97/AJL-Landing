# Citas por agendar con cada cobro mensual

Estado: **publicado el 26-nov-2026** · 26-nov-2026 · lo pidió Alejandro · diagrama: `ailab/.archify/explainer-citas-por-cobro-20261126-161923/citas-por-cobro.html`

## Por qué

Cada cobro mensual de un paquete trae citas. Romi tiene que enterarse de que alguien pagó y poder agendar esas citas. Hoy no puede:

- **Correo:** el equipo (Romi, Irene, Alejandro) recibe correo solo del primer y del último cobro de una suscripción de la web (`avisarFijas` en `server/suscripciones/procesar.mjs`). De los cobros intermedios solo recibe recibo el paciente.
- **Panel:** solo el primer cobro queda unido a una cita (la que el paciente eligió al comprar). Los cobros siguientes se guardan en `suscripcion_cobros`, pero no crean nada que agendar.
- **Suscripciones hechas a mano:** la web las descarta a propósito (`esPlanDeLaWeb`). No están en la base, el panel ni el respaldo.

Revisado el 26-nov-2026 en Mercado Pago (solo lectura): además de las suscripciones de la web hay varias creadas a mano, casi todas en la cuenta de la empresa y alguna en la personal.

## Objetivo

1. Cada cobro aprobado avisa al equipo por correo y aparece en el panel.
2. El panel dice cuántas citas le faltan agendar a cada paciente.
3. Romi agenda desde esa fila con el link de un solo uso de siempre.
4. Vale para las suscripciones de la web y para las hechas a mano en la cuenta de la empresa.

## Lo que no es

- No cobra, no devuelve, no cancela ni calcula penalidades de las hechas a mano.
- No lee la Base Maestra.
- No agenda solo: Romi pulsa «Agendar» y el paciente elige hora.
- No cubre la suscripción de la cuenta personal de Mercado Pago: se lleva a mano.
- No reemplaza al robot de siguiente cita del 912 (ver «Coordinación»).

## Anti-objetivos (fracaso aunque funcione)

- **Que la web toque el dinero de una hecha a mano.** Mandarle recibo, cancelarla en Mercado Pago o cobrarle penalidad, por tratarla como una de la web.
- **Que un pago avise o sume dos veces.** Pasaría si llega por el webhook y por la revisión.
- **Que una cita se le asigne a otro paciente.** Pasaría si el panel uniera un pago a un paciente por el nombre de Mercado Pago, que es el de quien paga.
- **Que el panel diga «faltan 0» a quien todavía tiene citas.** Es peor que mostrar de más: Romi dejaría de llamarlo.
- **Que el respaldo siga dando 429** y deje cobros sin registrar.

## Decisiones de Alejandro (26-nov-2026)

1. Alcance: solo el cobro mensual automático, incluidas las hechas a mano.
2. El panel calcula: `Faltan = citas que dan los cobros aprobados − citas usadas o agendadas`. No se guardan «fichas» por cita.
3. En la primera versión, el cobro se ve en el panel y llega por correo: «Romi tiene que enterarse que alguien pagó».
4. No hay formulario aparte para asignar paciente: la suscripción se une al paciente con el link del botón «Agendar» de su fila, y el paciente llena sus datos.
5. Las reservas hechas antes con «Agendar a un paciente que ya pagó» **no se unen**. En su próximo cobro, el paciente vuelve a llenar el link.
6. Citas por cobro: Acompañamiento 1 al mes; Constancia 3 el primer pago y 2 en los siguientes; Transformación 5 y luego 4. «Con la 3.ª y la 5.ª cita se cierra lo del primer pago.»
7. Las citas sin usar se acumulan para el mes siguiente, «por ahora».
8. Sin buscador en la Base Maestra en esta versión.
9. **Una fila sigue en «Por agendar» mientras le falten citas**, aunque la suscripción haya terminado, se haya cancelado o ya no salga en la lista de Mercado Pago. No hay vencimiento automático: si Romi da una cita por perdida, la descuenta con el ajuste manual.
10. **Arranque de las de la web que ya cobraron, con ajuste inicial:** al publicar, cada una aparece «por revisar» hasta que Romi anota una vez cuántas citas ya usó o agendó. No se cuenta solo desde la publicación, porque eso borraría las citas acumuladas.

## Lo que ya existe (origin/main `8d52156`)

- **Webhook** `functions/api/reservas/webhook-mp.js` → `handleWebhookMp` (`server/handlers/reservas.mjs`) → `procesarCobro` para `subscription_authorized_payment`. Responde 500 si falla y Mercado Pago reintenta.
- **Registro idempotente:** `registrarCobro` (`server/suscripciones/repo.mjs`). `suscripcion_cobros.mp_payment_id` es `UNIQUE`. Devuelve `nuevoAprobado` solo a quien suma el cobro, y de eso cuelgan hoy los correos.
- **Respaldo diario** `barrerSuscripciones`, disparado por `workers/resumen-cron` a las 8:00 de Lima. Pide los cobros de cada suscripción activa, una tras otra, sin pausa. Del 13 al 24-nov-2026 mandó 11 avisos de error, todos `429 local_rate_limited`.
- **Lista de Mercado Pago:** cada suscripción trae `summarized.charged_quantity` y `last_charged_date`. El 26-nov: 32 con 1 cobro y 3 sin dato.
- **Links de un solo uso:** `links_agenda` (`db/d1/0007`, `0009`, `0010`) guarda `plan`, `cita`, `nutri_sugerida` y la reserva que salió (`reserva_id`; `reservas.link_id`). Lo crea «Agendar a un paciente que ya pagó» (`crearLink` en `server/handlers/equipo-links.mjs`). `agendarConLink` crea el cliente y la reserva `confirmada`.
- **Citas por plan:** `citasTotales` y `citasDePlan` en `server/agenda/opciones.mjs` y `sessionsPerMonth`/`firstMonthEval` en `src/data/plans.js`. Dan los mismos totales que la decisión 6 (Constancia 3 meses = 7; Transformación 3 meses = 13).
- **Suscripciones de la web:** `suscripciones` (`db/d1/0016`), con `reserva_id` de la primera cita, `producto`, `duracion_meses` y `mp_preapproval_id`.

## Cómo queda

### Flujo

1. **Entra el cobro** en Mercado Pago.
2. La web se entera por dos caminos:
   - **2a. Webhook**, al momento. Ya existe. Desde ahora, el cobro de una hecha a mano se guarda en vez de descartarse.
   - **2b. Revisión cada 15 minutos.** Reemplaza al respaldo diario. Pide **una sola lista** de suscripciones vigentes (`/preapproval/search?status=authorized`, paginada de 50 en 50). Para cada suscripción cuyo `charged_quantity` sea mayor que los cobros que la web tiene aprobados, pide sus cobros y los registra. Las demás no generan consultas.
3. **Registra el pago en su suscripción.** Cada pago trae el número de su suscripción (`preapproval_id`). Si es una hecha a mano que la web no conocía, la crea con los datos de Mercado Pago y queda «sin asignar». **Aquí no se crea ningún paciente.** Si el número de pago ya estaba aprobado, no pasa nada.
4. **Correo al equipo**, solo si el registro fue nuevo: quién pagó, cuánto, qué cobro es (2 de 3) y cuántas citas faltan, o «sin asignar».
5. **Por agendar:** el panel muestra el cobro y las citas que faltan.
6. **Romi pulsa «Agendar»** en la fila. Abre el formulario de siempre (producto, duración, qué cita) y crea un link de un solo uso que **lleva el id de la suscripción**.
7. **El paciente llena el link y elige hora. Aquí se registra el paciente:** el link le pide sus datos, como hoy (`agendarConLink` crea el cliente). Se reconoce al paciente por su documento, como hoy (`pacientePorDni` en `handleAgendaConfirmar`): si ya existe, se usa su ficha; si no, se crea una nueva. Nunca por WhatsApp, que una familia puede compartir. *(Decisión de Claude tras la revisión.)* La primera vez, además, une la suscripción con ese paciente. «Faltan» baja en uno.

### El cruce pago-paciente

Es por suscripción y ocurre una sola vez. Después, cada pago se reconoce por su `preapproval_id`.

| Suscripción | Cuándo se une al paciente |
| --- | --- |
| De la web | Al comprar, como hoy (`suscripciones.reserva_id`). |
| Hecha a mano | Cuando el paciente usa el primer link creado desde su fila. |

### Suscripciones hechas a mano: datos aparte

Se guardan en **tablas propias**, no en `suscripciones`. Así ningún camino que hoy manda recibos, cancela o cobra penalidades (`procesarCobro`, `barrerSuscripciones`, `avisarBaja`, `cancelarEnMp`) puede tocarlas. *(Decisión de Claude: cumple el primer anti-objetivo por construcción, no por cuidado en cada función.)*

Lo mínimo que hay que guardar:

- **Por suscripción:** `preapproval_id` (único), lo que dice Mercado Pago (nombre del pagador, `reason`, monto, fecha de creación, estado), y lo que se une después: cliente, producto, meses, citas por cobro (para fuera de catálogo) y citas usadas antes de unirla.
- **Por cobro:** número de pago (único), monto, estado, fecha y número de cobro.

Una suscripción hecha a mano se reconoce porque su `reason` no empieza con `PREFIJO_PLAN`. Comprobado el 26-nov-2026: todas traen `reason` y `preapproval_plan_id`, y ninguna empieza con el prefijo. Su `reason` dice las sesiones al mes («3 meses - 2 sesiones mes»), así que sirve para sugerir el plan en el primer «Agendar».

### Cuenta de citas

```
Faltan = Σ citas de cada cobro aprobado
       − citas usadas antes de unirla (solo hechas a mano)
       − la primera cita, si se eligió al comprar (solo web)
       − reservas de links de esta suscripción que no estén canceladas ni expiradas
       + ajuste manual
```

- **Citas por cobro:** del plan (decisión 6). En las hechas a mano, el plan lo elige Romi en el primer «Agendar». Para lo que la web no vende (por ejemplo, «2 meses, 4 sesiones», S/510), hay una opción «Otro» donde escribe cuántas citas da cada cobro.
- **Citas usadas antes de unirla:** sale de «qué cita» del primer link. «Cita 2 de 3» = 1 usada.
- **Cancelación:** una reserva cancelada deja de restar, así que «Faltan» vuelve a subir.
- **Acumulación:** lo que no se usa pasa al mes siguiente (decisión 7). El panel no vence citas.
- **Ajuste manual (+/−, con motivo):** para citas agendadas fuera del panel y para aplicar a mano la regla de las condiciones (sesión no agendada tras 4 mensajes = usada). *(Decisión de Claude: sin esto, cualquier cita agendada por fuera deja el número inflado para siempre.)*

### Panel: sección «Por agendar»

Una fila por suscripción, de las dos clases, mientras tenga algo que hacer: citas que faltan, «sin asignar» o «por revisar». Que la suscripción esté terminada o cancelada no la oculta (decisión 9).

| Paciente | Cobro que entró | Faltan |
| --- | --- | --- |
| Ana Pérez · Acompañamiento 3 m | 27-nov · S/270 · 2 de 3 | 1 · [Agendar] |
| usuario.mp (Mercado Pago) | 28-nov · S/270 · sin asignar | [Agendar] |

- Las filas «por revisar», «sin asignar» y con «Faltan > 0» van arriba.
- **Por revisar** (solo al publicar, las de la web que ya habían cobrado): no muestra «Faltan» hasta que Romi anota las citas usadas o agendadas hasta ese día. Ese número entra como ajuste inicial (decisión 10).
- Una suscripción sin asignar muestra lo que sabe Mercado Pago: nombre del pagador, `reason`, monto y fechas.
- **Cambiar paciente** (administradores): corrige una unión equivocada. Los cobros se quedan en la suscripción.

### Correo al equipo

- **Suscripciones de la web:** en `procesarCobro`, cuando `nuevoAprobado` y el cobro no es el primero ni el último (esos ya avisan), sale un correo a las fijas.
- **Hechas a mano:** el mismo correo cuando se registra un cobro nuevo.
- **Carga inicial:** la primera vez que la revisión encuentra las hechas a mano, registra sus cobros pasados **sin mandar correo**. Solo avisa de los cobros posteriores. *(Decisión de Claude: si no, el equipo recibe de golpe un correo viejo por cada una.)*
- Si el correo falla, no se reintenta: el cobro igual sale en el panel. Es lo mismo que pasa hoy con el recibo.

### Revisión cada 15 minutos

- Va en el cron `*/15` de `workers/resumen-cron` y se suma al respaldo diario; no lo reemplaza.
- **El respaldo diario sigue**, con pausa entre consultas y reintento ante 429, y solo para las suscripciones de la web. Es el que detecta un cobro pendiente que pasó a aprobado o un cobro fallido, que el contador de la lista puede no reflejar. *(Decisión de Claude tras la revisión.)*
- Una página de la lista cada 50 suscripciones. Solo pide cobros de las suscripciones cuyo contador subió.
- Ante un 429: espera y reintenta una vez. Si sigue fallando, deja esa suscripción para la próxima vuelta y no manda correo de error hasta que falle 4 vueltas seguidas. *(Decisión de Claude: el aviso de hoy salta por un 429 aislado.)*

## Coordinación

- **Robot de siguiente cita del 912** (`agendar_siguiente.py`, en seco): si un día agenda solo, tiene que crear la cita por este mismo link o usar el ajuste manual. Si no, el panel cuenta de más.
- **Base Maestra:** «Copiar para la base maestra» no cambia en esta versión.

## Planes nuevos desde ahora

Los planes mensuales se cobran con «Generar link de reserva» → «Mensual automático», o con «Mensual, ya tiene cita». Con los dos caminos, el paciente queda unido desde el primer pago. Los links hechos a mano en Mercado Pago quedan solo para lo que la web no vende. Así la parte «sin asignar» se va vaciando a medida que terminan las que existen hoy.

## Por comprobar antes de construir

Prueba natural: el primer cobro de una suscripción hecha a mano posterior a la publicación.

1. **¿Llega el webhook de una hecha a mano?** El código lo supone (`esPlanDeLaWeb` la descarta), pero no hay prueba. Si no llega, la revisión del paso 2b es el único camino y el aviso tarda hasta 15 minutos.
2. **¿Sube `charged_quantity` con el segundo cobro?** Si no sube, la revisión tiene que comparar `last_charged_date` o pedir los cobros de todas.
3. **¿El token de la web ve las de la empresa?** Se midieron con el token del Llavero `ajl-mercadopago-ruc20`; falta confirmar que es el mismo que tiene la web.

## Approaches

| Enfoque | Qué es | Por qué sí o no |
| --- | --- | --- |
| **A. El panel calcula** (elegido) | Faltan = citas de los cobros − citas usadas. Nada se guarda por cita. | Un cobro repetido o una cita cancelada se corrigen solos. Es lo que eligió Alejandro. |
| B. Una ficha por cita | Cada cobro crea N filas «cita por agendar» que se marcan al usar. | Hay que mantenerlas al cancelar, al ajustar y al corregir. Descartado. |
| C. Solo correo | Avisar al equipo y que Romi lleve la cuenta en la Base Maestra. | No dice cuántas faltan; es lo que hay hoy en la cabeza de Romi. Descartado. |

Para el paso 5 (unir la suscripción al paciente) se consideraron un formulario aparte, con buscador de clientes, y el link de «Agendar». Ganó el link (decisión 4): el paciente escribe sus propios datos y Romi no tiene que buscarlo.

## Pruebas automáticas

- Webhook y revisión con el mismo pago, a la vez: un solo registro y un solo correo.
- Un cobro de una hecha a mano nunca llama a `correoRecibo`, `cancelarEnMp`, `avisarBaja` ni penalidades.
- Cuenta de citas: Constancia 3 meses con 2 cobros = 5; con 1 reserva cancelada vuelve a sumar; acumulación entre meses.
- Link desde una fila sin asignar: al usarse, une la suscripción, guarda el plan y las citas previas según «qué cita».
- Revisión: con `charged_quantity` igual al registrado, no pide cobros; ante 429, reintenta una vez y no avisa.
- Carga inicial: registra los cobros viejos sin mandar correos.

## Lo que queda para quien construye

- Nombres de tablas y columnas, y la migración (la siguiente es `0021`).
- Textos del correo y del panel, en el tono de los actuales.
- Cómo se dibuja la sección «Por agendar» en `src/pages/panel/index.astro`.

## Despliegue

Push a `reservas-pago` publica el sitio de prueba (que cobra plata real). Push a `main` publica producción y requiere el OK de Alejandro o Joaquín.
