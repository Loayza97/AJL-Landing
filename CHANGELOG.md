# Changelog · ajlnutricion.com

Cambios visibles del sitio y de la reserva web, del más reciente al más antiguo. Detalle técnico en `docs/superpowers/specs/` y `docs/superpowers/plans/`.

## Pendiente de publicar (rama `reservas-pago`, versión de prueba)

- Panel /panel/links/: el plan se elige en tres listas que dependen una de otra (producto, duración y qué cita es, como «2 de 7»; Constancia y Transformación suman una cita más el primer mes); «Seguimiento» pasa a llamarse «Acompañamiento» y ya no está «Otro».
- Links: cualquier tipo de evento admite la primera cita; la sesión de 1 hora se ofrece solo en hora en punto y los controles de 30 min también a la media.
- /agenda/: la página abre con una nutricionista ya elegida, repartida por turnos entre el equipo en cada link nuevo.

- Portada: «dietas» se tacha con una línea al cargar y aparece «Aprende a comer.».
- Portada: la foto del equipo tiene un paralaje suave (mouse en computadora, scroll en todos).
- Portada: el botón «Quiero empezar →» tiene un brillo que lo recorre y un halo que late.
- Todo se queda quieto si el dispositivo pide reducir movimiento.
- Interno: motor de horarios preparado para citas de 30 min y para impedir cruces de horario; sin cambios para el paciente.
- Links de agenda de un solo uso para pacientes que pagaron por otro medio: panel /panel/links/ y página /agenda/.
- Usuarios del equipo: los súper usuarios dan y quitan acceso al panel en /panel/usuarios/.
- Links: el paciente avisa al equipo por WhatsApp al agendar; el equipo puede borrar links sin usar.
- Panel /panel/links/: la tabla «Agendados» se actualiza junto con la de links (al crear o reactivar uno y al volver a la pestaña); antes podía decir «No hay citas» con un link ya «Agendado».
- Panel /panel/links/: botón «Borrar» en los links sin usar o vencidos (pide confirmación); el link borrado abre «Este link no existe».
- Panel /panel/links/: al crear un link se elige el plan del paciente y qué cita es; se ven en la lista de links, en «Agendados», en el CSV (columnas «Plan» y «Cita») y en el evento del calendario.

## 2026-10-12

- Panel del equipo en `/panel/` (Romi, Alejandro, Joaquín): quién pagó, quién dejó datos sin pagar (30 días), marcar «contactado» y descargar Excel. Acceso con código de 6 dígitos por correo.
- Reserva, pantalla 2: recuadro «Incluye» con todo lo del plan (sesiones, evaluación, plan en la app, seguimiento por WhatsApp, clases en vivo y comunidad).
- Reserva: la evaluación del primer mes se presenta como sesión numerada («3ra sesión de evaluación al final de tu primer mes»; 5ta en el plan de 4 sesiones).
- Portada: prueba A/B del botón principal. Al azar, «Descubre tu plan →» (A) o «Mira precios aquí →» (B); se cuentan vistas, clics y reservas pagadas por versión, sin identificar a nadie.
- Reserva, pantalla final: botón verde «Avisar al equipo por WhatsApp» con el mensaje de la cita ya escrito.
- Reserva, pantalla 3: el filtro dice «Elige a tu nutricionista».
- Reserva: la hora de 1 a 2 p. m. (almuerzo del equipo) ya no se ofrece ningún día.

- Portada: el botón principal pasa a «Quiero empezar →» y lleva a `/reservar/`.
- Reserva, pantalla 3: calendario del mes con la próxima hora disponible, horas separadas en mañana y tarde, y filtro opcional por nutricionista con foto (Nico, Paola, Jussara, Paolo).
- Reserva, pantalla final: «Agregar a Google Calendar» abre Google con la cita cargada; «Otro calendario» descarga el `.ics` para Apple u Outlook.
- El resumen diario lo dispara el Worker `ajl-resumen-cron` (8:00 en Lima), sin URL pública.

## 2026-10-10 · lanzamiento de la reserva con pago

- Reserva y pago en la web con Mercado Pago (producción): plan, duración, hora, datos y pago.
- Paquete de 6 meses: S/1.500, S/1.950 y S/2.808; la tabla de la landing suma la columna «6 meses».
- Pantalla 2 con las duraciones en tarjetas lado a lado (opción B) y el ahorro de cada paquete.
- Cuotas hasta 12 con tarjeta de crédito; los intereses los cobra el banco del paciente.
- Datos del paciente: nombres, apellidos (materno opcional), fecha de nacimiento y documento (DNI, Carné de Extranjería o pasaporte).
- Condiciones y privacidad se abren en una ventana desde el formulario.
- Elegir otra hora suelta la anterior; cada hora apartada se libera sola a los 15 minutos (30 si llegó a Mercado Pago).
- Resumen diario al equipo de quienes dejaron datos y no pagaron (desde el último envío, sin perder días).
- Los botones de planes llevan a `/reservar/`; `/checkout/*` redirige ahí. Sin recargo por tarjeta.
- Condiciones del servicio 2026-10-09 y política de privacidad v1.5.

## 2026-10-01

- El sitio pasa de Vercel a Cloudflare Pages (`www`); el apex sigue redirigiendo desde Vercel.
