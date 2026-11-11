# Cambiar la web a la cuenta personal de Mercado Pago (RUC 10)

Estado: **en producción** desde el 10-nov-2026 (merge fc4a709), con la reducción de abajo · diseño del 09-nov-2026 · lo pidió Alejandro.

> **Reducción del 10-nov-2026 (Alejandro):** solo se cambian las credenciales y el webhook, y se filtra la alerta de plan desconocido (§2, último punto, que se queda porque el equipo crea planes a mano en Mercado Pago). **Se sacan** la columna `cuenta_mp` y las guardas de las filas de FJ (el resto de §2). Con eso, en las suscripciones viejas de FJ, «Sincronizar» da error y «Cancelar mi plan» en el último mes le pide al paciente escribir por WhatsApp. La penalidad pagada ya avisa al equipo para cancelar a mano (`cancelarEnMp`). Para los links sin pasar por las primeras pantallas, se usa «Copiar (mensual)» de «Links de reserva web», que ya existe. Plan: `docs/superpowers/plans/2026-11-10-cambio-cuenta-mercado-pago.md`.

## Por qué

La cuenta de Mercado Pago con la que cobra la web está a nombre de **FJ INVESTMENTS S.A.C. (RUC 20609894963)**. AJL declara como **RUC 10 de Alejandro Juan Loayza Jordan (10745825694)**, una persona natural sin negocio que emite recibos por honorarios. Cada cobro de la web deja un ingreso en la empresa, y la empresa no lo declara.

Soporte de Mercado Pago (caso 494261463) confirmó que la titularidad no se cambia. La cuenta negocio no acepta un RUC 10 sin negocio. Por eso el 08-nov-2026 Alejandro creó una **cuenta personal de Mercado Pago con su DNI**. El 09-nov:

- creó desde esa cuenta un plan de suscripción de S/5;
- lo pagó desde otra cuenta;
- dio la prueba por buena: «verificado».

Culqi sigue siendo el destino de largo plazo (RUC 10, comercio «ajl nutricion»). En producción solo tiene CulqiLink, y la activación de Culqi Online está pedida a soporte. Este proyecto es el puente mientras tanto, y sirve también para esa migración: deja resuelto qué hacer con lo que queda vivo en una cuenta vieja.

## Objetivo

Que **todo cobro nuevo** de la web y del panel entre a la cuenta personal:

- la reserva con pago (Checkout Pro);
- las suscripciones de los paquetes;
- los links de suscripción del panel;
- el cobro de penalidades.

Además, que la web no vuelva a usar la cuenta de FJ Investments.

## Lo que no es

- No migra a Culqi. Eso es otro proyecto.
- No mueve las suscripciones vivas a la cuenta nueva.
- No cambia el flujo del paciente, los precios ni los textos de venta.

## Anti-objetivos (sería un fracaso aunque funcione)

- **Que el cambio cancele la suscripción de un cliente.** Por ningún motivo: ni las activas ni las pendientes.
- **Que alguien pague y la web no se entere.** Pasaría si un paciente usa un link o un pago viejo de la cuenta de FJ después del cambio.
- **Que a un paciente se le cobre algo que ya canceló**, o que no pueda darse de baja.
- **Que alguna credencial aparezca en el repositorio**, que es público, o en el chat.

## Decisiones de Alejandro

1. **La cuenta personal reemplaza a la de FJ en todo** (web, panel, cobros), decidido el 09-nov.
2. **La cuenta vieja se desvincula de la web por completo.** No se guarda su credencial ni se maneja en paralelo. Las suscripciones que ya cobra siguen cobrando allá solas, hasta que terminen, y se atienden a mano. Hoy son 7 activas de la web y 9 de planes manuales.
3. **Ante SUNAT queda en orden:** el dinero entra a su cuenta, emite recibo con su RUC 10 y declara con ese RUC.
4. **El cambio no cancela ninguna suscripción**, ni siquiera las pendientes sin cobro (09-nov). Con razón: el caso de Josué mostró que una fila `pendiente` en la base puede ser un cliente que ya está pagando.
5. **Todas las suscripciones de FJ tienen un número fijo de cobros**, también las 9 de planes manuales (lo afirma Alejandro; las 7 de la web se comprobaron en la base). Terminan solas.
6. **Los textos legales no se cambian** (09-nov). Siguen nombrando a FJ Investments.
7. **Todo el sistema funciona con la cuenta nueva como si la de RUC 20 no existiera:** pasarela, panel, avisos, correos y mensajes (09-nov). Por eso los pacientes de FJ dejan de recibir el recibo mensual que manda la web.

## Lo que ya existe (hechos, revisados el 09-nov)

- **Credenciales.** La web usa solo `MP_ACCESS_TOKEN` (todas las llamadas) y `MP_WEBHOOK_SECRET` (firma de los avisos). Todo pasa por `crearMp(env)` en `server/reservas/mercadopago.mjs`:
  - preferencias de Checkout Pro;
  - `GET /v1/payments/{id}`;
  - `preapproval_plan` y `preapproval`;
  - `authorized_payments`.

  No hay reembolsos por API.
- **Avisos de Mercado Pago:** llegan a `https://www.ajlnutricion.com/api/reservas/webhook-mp`.
- **Bases de datos:** `ajl-reservas` (producción) y `ajl-reservas-preview` (sitio de prueba). Las migraciones están en `db/d1/`; la última es `0018_mp_plan.sql`.
- **Suscripciones en producción:** 7 `activa` (6 de 3 meses y 1 de 6), 6 `pendiente` (5 de 3 meses y 1 de 6) y 1 `cancelada`. Ninguna es de mes a mes, así que todas tienen un número fijo de cobros y terminan solas. Las de mes a mes (`cobros: null` en `calculo.mjs`) no terminarían nunca. Las pendientes pueden ser abandonos o cobros aprobados que nadie sincronizó, como pasó con Josué.
- **El panel de suscripciones** solo tiene «Sincronizar con Mercado Pago» (para administradores) y «Marcar penalidad pagada», que no llama a Mercado Pago (`src/scripts/panel-suscripciones.js`). No tiene «Cancelar» ni «Cobrar penalidad».
- **Cuándo se crea el plan:** el plan de un link del panel se crea cuando el paciente envía el formulario (`handleSuscripcionLink` → `crearSuscripcion`), no cuando el equipo genera el link.
- **Alerta de plan desconocido:** `avisarPlanDesconocido` (`server/suscripciones/procesar.mjs`) supone que todos los planes de la cuenta son de la web. Si un plan no está en la base, avisa al equipo que hay que devolver ese pago. La web nombra sus planes `AJL Nutrición · <título>`.
- **Links ya usados:** un link del panel que ya se usó responde 410 si el paciente lo vuelve a abrir (`server/handlers/suscripciones.mjs:104`). Así que una pendiente de FJ no puede generar un plan nuevo en la cuenta personal.
- **Correos de la web** (`server/suscripciones/correos.mjs` y otros): no nombran a la empresa ni a la cuenta. Salen cuando llega un aviso de Mercado Pago, así que funcionan con la cuenta que mande los avisos.
- **Despliegue:** push a `reservas-pago` publica el sitio de prueba; push a `main` publica producción, y requiere el OK de Alejandro o Joaquín. El sitio de prueba también cobra plata real.

## Cómo queda

### 1. Credenciales nuevas (las hace Alejandro, no Claude)

1. En Mercado Pago Developers, **con la cuenta personal**, crear una aplicación (Checkout Pro y Suscripciones).
2. En esa aplicación, configurar el webhook con la misma URL de producción, eventos **Pagos** y **Planes y suscripciones**, en modo productivo. Guardar su clave secreta.
3. Cargar las dos credenciales, sin pegarlas en el chat:
   ```
   npx wrangler pages secret put MP_ACCESS_TOKEN --project-name ajl-landing
   npx wrangler pages secret put MP_WEBHOOK_SECRET --project-name ajl-landing
   ```
   Repetirlo para el entorno de prueba (`--env preview`) cuando se pruebe ahí. Al sobrescribirlas, la credencial vieja desaparece de la web: eso es la desvinculación.
4. Cancelar la suscripción de prueba de S/5 en la cuenta personal, para que no vuelva a cobrar.

### 2. Marcar lo que pertenece a la cuenta vieja

La web no vuelve a hablar con FJ, pero en la base quedan filas cuyos planes viven allá. Si no se marcan, sus botones llamarían a la cuenta personal con un plan que no existe en ella y fallarían. Marcarlas es la forma de que la web las trate como historia y no como algo que gestiona.

- Una migración nueva agrega `cuenta_mp` a `suscripciones`, con los valores `'fj'` y `'personal'` y `'personal'` por defecto. Al hacer el cambio pasan a `'fj'` **solo las filas que ya tienen plan en Mercado Pago** (`mp_plan_id` o `mp_preapproval_id` no nulos). Un link del panel sin usar todavía no tiene plan: cuando el paciente lo use, el plan se crea en la cuenta personal y la fila queda `'personal'`. *(Decisión de Claude, tras la revisión: la regla depende del plan, no de la fecha).*
- **Panel, en las filas `'fj'`:**
  - etiqueta «Cuenta anterior: gestionar en Mercado Pago de FJ»;
  - sin «Sincronizar», porque fallaría con la credencial nueva;
  - «Marcar penalidad pagada» sigue igual.
- **«Cancelar mi plan» para una fila `'fj'`:**
  - el paciente ve: «Recibimos tu pedido; te escribimos para confirmar la baja»;
  - el equipo recibe un correo: «Baja pedida en la cuenta anterior: cancelar a mano en Mercado Pago y calcular penalidad».

  Así nadie se queda sin poder darse de baja.
- **Penalidad de una fila `'fj'`:** se puede pagar desde «Cancelar mi plan», desde el modo deuda o desde el correo de deuda (`avisarPenalidadPendiente`). En los tres casos se cobra en la cuenta personal, lo que va con la decisión 3: todo ingreso nuevo, al RUC 10. Después de pagar no se llama a `cancelarEnMp`, porque daría 404. En su lugar sale el mismo correo al equipo: «Penalidad pagada; cancelar la suscripción a mano en Mercado Pago de FJ». *(Decisión de Claude).*
- **Alerta de plan desconocido:** la cuenta personal es de Alejandro y puede tener planes que no son de la web, como la prueba de S/5 del 09-nov o planes manuales. La alerta de «devolver» sale solo si el `reason` del plan empieza con `AJL Nutrición ·` y el plan no está en la base. Si no, se registra y no se avisa. *(Decisión de Claude).*
- Un 404 de Mercado Pago hoy lanza un error, el webhook responde 500 y Mercado Pago reintenta. Se deja así: ya no debería pasar, porque los avisos de la aplicación vieja se caen antes, en la firma (401).

### 3. Lo pendiente que quedaría colgado en la cuenta vieja

- **Links de suscripción del panel:** los que no se usaron no tienen plan todavía, así que después del cambio funcionan solos en la cuenta personal y no hay que tocarlos. Los que se usaron y quedaron sin pagar tienen su plan en FJ: son las pendientes.
- **Reservas apartadas con pago a medias:** su preferencia de Checkout Pro es de la cuenta vieja.
  - El cambio se hace en un horario sin reservas apartadas.
  - Se comprueba en la base antes de cambiar las credenciales.
- **Las 6 suscripciones pendientes:** antes del cambio, con la credencial vieja todavía cargada, se sincronizan una última vez. Las que tengan un cobro aprobado pasan a `activa`. **No se cancela ninguna** (decisión 4): todas quedan `'fj'`. Si alguna se paga después en FJ, la web no se entera; el equipo la ve en el Mercado Pago de FJ y la atiende a mano, como las demás de esa cuenta.
- **Webhook de la aplicación vieja:** se borra en Developers, desde la cuenta de FJ. Solo apaga los avisos a la web; no toca ningún cobro.

### 4. Textos legales

No se cambian (decisión 6).

### 5. Correos, avisos y mensajes

No necesitan código propio. Todo lo automático de la web sale de un aviso de Mercado Pago o de una llamada con `MP_ACCESS_TOKEN`:

- el recibo de cada cobro;
- el correo al equipo por una suscripción nueva o una baja;
- el aviso de penalidad pendiente;
- la confirmación de la reserva pagada.

Con la credencial y el webhook nuevos, todo eso pasa a responder a la cuenta personal. Los correos que manda Mercado Pago mismo («nuevo suscriptor», ventas) llegan al correo de la cuenta personal.

## Orden del cambio

Mientras dure la prueba, el webhook de la **aplicación nueva** apunta al sitio de prueba (`<url de reservas-pago>/api/reservas/webhook-mp`). Producción sigue con la aplicación de FJ y su propio webhook, así que no se mezclan. Los avisos de los planes van a la URL de la aplicación, no a la de cada preferencia. Al pasar a producción se cambia esa URL. *(Decisión de Claude, tras la revisión: si no, los avisos de prueba caerían en producción con la clave equivocada).*

1. **Construir y probar en `reservas-pago`** con las credenciales nuevas en el entorno de prueba:
   - una reserva pagada de S/5;
   - un link de suscripción del panel pagado y cancelado;
   - que el aviso llegue y verifique la firma;
   - que una fila `'fj'` se vea y se comporte como en la sección 2.
2. **Con el OK de Alejandro o Joaquín:**
   1. sincronizar las 6 pendientes (todavía con la credencial vieja), sin cancelar ninguna;
   2. comprobar que no haya reservas apartadas;
   3. cargar las credenciales nuevas en producción;
   4. push a `main`;
   5. aplicar la migración y marcar las filas `'fj'`;
   6. cambiar la URL del webhook de la aplicación nueva a la de producción.
3. **En la cuenta de FJ:** borrar el webhook. Nada más: no se tocan planes ni suscripciones.
4. **Primer cobro real en producción:** revisar que llegue a la cuenta personal.

## Lo que queda a mano mientras viva la cuenta vieja

Esos pacientes **dejan de recibir el correo de recibo** de cada cobro, que trae el link «Cancelar mi plan». El link de los correos que ya recibieron sigue sirviendo. En el panel, «cobros aprobados» se queda en el último valor que vio la web.

Todas terminan solas (decisión 5). Hasta entonces, para las 7 activas de la web, las 6 pendientes y las 9 de los planes manuales, el equipo:

- cancela las bajas;
- calcula las penalidades;
- revisa los cobros fallidos

directamente en el Mercado Pago de FJ. La web les muestra la etiqueta y avisa por correo cuando alguien pide la baja.

## Pruebas automáticas

- `crearMp` sin cambios: las pruebas actuales tienen que seguir verdes.
- Panel y «Cancelar mi plan» con una fila `'fj'`: no llaman a Mercado Pago, muestran el texto y avisan al equipo.
- Penalidad pagada de una fila `'fj'`: no llama a `cancelarEnMp` y avisa al equipo.
- Plan desconocido: sin el prefijo `AJL Nutrición ·` no avisa; con el prefijo, avisa igual que hoy.
- Migración: las filas existentes quedan en `'fj'` y las nuevas en `'personal'`.

## Lo que queda para quien construye

- El texto exacto de la etiqueta y de los correos al equipo, en el tono de los correos actuales.

## Preguntas abiertas

Ninguna. Las respondió Alejandro el 09-nov (decisiones 4 a 7).
