# Changelog · ajlnutricion.com

Cambios visibles del sitio y de la reserva web, del más reciente al más antiguo. Detalle técnico en `docs/superpowers/specs/` y `docs/superpowers/plans/`.

## Pendiente de publicar (rama `reservas-pago`, versión de prueba)

- Requisitos para la consulta: el correo de confirmación al paciente (web y link) y la pantalla de cita confirmada muestran los requisitos según la modalidad. Presencial: venir aseado(a) y la ropa para las mediciones. Virtual: pesarse y tallarse antes, de preferencia en ayunas. Texto en `src/data/requisitos.js`. Si el equipo cambia la modalidad desde el panel, el paciente recibe «Tu cita ahora es virtual/presencial» con el Meet o la dirección y los requisitos nuevos.
- Horario de Paolo: los jueves atiende de 2 a 8 p. m. (antes de 10 a 5). Sigue igual: lunes y viernes de 2 a 8, y alterna martes de 2 a 8 con sábado de 10 a 5.
- /reservar/ y /agenda/: se puede agendar hasta seis semanas adelante (antes tres). El calendario recorre los meses que toque esa ventana.
- Correos al equipo: cada cita agendada (web o link), cambiada o cancelada desde el panel avisa a Romina, Irene, Alejandro y la nutricionista de la cita, con paciente, fecha, modalidad, plan, cita y WhatsApp. Si se cambia de nutricionista, la anterior recibe «Ya no atiendes a …». Los correos están en el secreto `CORREOS_EQUIPO` de Cloudflare (no en el código). Si un correo falla, la cita sigue igual.
- Panel, Reservas: botón «Cancelar cita» junto a «Editar» en cada cita confirmada que no pasó. Pide confirmar, libera la hora (web, links y tope), borra el evento de Google Calendar (Google avisa al paciente) y la fila se queda en rojo con «Cancelada por …». Si Google falla, la cita igual queda cancelada y el equipo recibe una alerta para borrar el evento a mano.
- Panel, Reservas: botón «Editar» en cada cita confirmada que no pasó. Cambia fecha, hora, nutricionista y modalidad (presencial o virtual) entre las horas libres de esa nutricionista, aunque el día esté lleno, nunca encima de otra cita. Actualiza el mismo evento de Google Calendar (Google avisa al paciente) y la fila muestra quién la editó y qué cambió. Requiere la migración 0015.
- /reservar/ y /agenda/: tope diario en minutos en lugar de 3 primeras sesiones. Suman las citas de la web y de los links por su duración: 300 minutos de lunes a viernes (5 de una hora, 10 de media o cualquier mezcla) y 480 el sábado. Con el día lleno no se agenda ni por la web ni por link. Los eventos con hora puestos a mano en Google Calendar vuelven a bloquear su tramo, sin sumar al tope: si el título nombra a una nutricionista (nico, paola, jussara o yuyu, paolo), solo a ella; si no nombra a nadie, a todas.
- Panel, Reservas: los pagos de la web muestran el neto que deja Mercado Pago después de su comisión («Neto S/1045,12»), también en el CSV. Solo para pagos nuevos; los links pagan por fuera y no llevan neto. «Copiar para la base maestra» lo pega en la columna P, al lado del bruto (O), sin mover las demás columnas. Requiere la migración 0014.
- Panel, links: nuevo producto «Renovación Constancia», de pago único y con 2 citas («1 de 2» y «2 de 2»).
- Panel y calendario: se quita la revisión automática de Google Calendar (cada 10 min y al abrir el panel). Los cambios hechos a mano en el calendario ya no pasan solos al panel.
- Panel: al abrirlo, las citas agendadas desde tu última visita salen resaltadas en verde con «Nueva», y arriba de Reservas dice cuántas son. Cada persona del equipo tiene su propia última visita (la primera vez se marcan las de las últimas 24 horas). Requiere la migración 0013.
- /reservar/ y /agenda/: las horas que se ofrecen dependen solo de las citas hechas por la web o por un link. Los eventos con hora que el equipo pone a mano en Google Calendar ya no bloquean horas ni cuentan para el tope de 3 primeras sesiones por día. Siguen contando los eventos de día completo: «cerrado» o «feriado» cierran el día y uno con el nombre de una nutricionista la saca ese día.
- Panel y calendario: si alguien cambia a mano en Google Calendar la hora, la duración o si una cita es presencial o virtual, la reserva se actualiza sola en 10 minutos o al abrir el panel, y la fila muestra «Editada en calendario» con el cambio. Si borran el evento o lo mueven a una hora ocupada, la fila queda marcada para revisar con los botones «Cancelar reserva» (libera la hora; la fila se queda en rojo y no se copia a la base maestra) y «Mantener». Requiere la migración 0012 y desplegar el Worker del cron.
- Google Calendar: el evento de cada cita nueva (web y link) se titula «Nombre · 2 sesiones al mes · 2 de 7» (pago único: «Nombre · 1 de 1»). La descripción lleva producto con nombre interno y meses, cita, nutricionista, WhatsApp, correo, procedencia (web o link) y el id de la reserva. El paciente invitado también lo ve.
- Portada: ya no aparece el pop-up del newsletter (10% OFF). Las rutas de confirmar y darse de baja siguen funcionando para quienes ya se suscribieron.
- Panel del equipo: cada persona entra con su correo y su propia contraseña, y el navegador puede guardarlas. El código por correo se pide solo la primera vez (para crear la contraseña), si la olvidó o al entrar desde un celular o computadora nueva (o tras 30 días). Requiere la migración 0011.
- Panel del equipo: todo en una página, /panel/ (/panel/links/ lleva ahí). Arriba se crean los links, al medio Links creados y abajo Reservas, una sola lista con las citas agendadas con link y las pagadas en la página web, la última agendada primero. Cada tabla muestra 4 filas y el resto con scroll adentro. Las columnas de Reservas siguen el orden de la base maestra (Apellidos, Nombres, DNI, Correo, Número, Nacimiento, País y Fecha; el país sale del código del número), la cita entra en una línea y «Copiar para la base maestra» deja las elegidas listas para pegar en la columna A. «No pagaron (30 días)» es una pestaña de Reservas.
- Panel /panel/links/: Agendados y su CSV salen en el orden en que se agendaron, la última primero, en vez de por fecha de la cita.
- /agenda/: si el paciente abre otra vez un link ya usado, debajo de su cita sale la dirección del consultorio con Google Maps o el link de Google Meet.
- /agenda/ y /reservar/: la modalidad dice «Presencial» o «Virtual»; debajo sale la dirección del consultorio con link a Google Maps o el aviso de Google Meet, y lo mismo en el paso de pago y en la pantalla final (con el link de Meet cuando ya existe).
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
