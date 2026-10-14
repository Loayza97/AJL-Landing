# Links de agenda de un solo uso · diseño

Fecha: 2026-10-12. Pedido de Alejandro, dictado por Joaquín. Figma (canvas): https://claude.ai/artifact/8PwjikrciMRqyK2VzPQZpa

## Para qué

Pacientes que pagaron por fuera de la web (transferencia, Yape, en persona) necesitan agendar sin pasar por el pago. El equipo crea un link de un solo uso, lo manda por WhatsApp y el paciente elige su hora. La cita sale en el calendario de AJL y en el del paciente. Reemplaza el uso de TidyCal para este caso.

## Decisiones tomadas

- Tres tipos de evento fijos (no editables en el MVP): `c30v` Control de 30 min · Virtual; `c30p` Control de 30 min · Presencial o virtual; `s60` Sesión de 1 hora · Presencial o virtual. En `c30p` el paciente elige En Lince o Por video; no hay un tipo de 30 min solo presencial (confirmado por Joaquín el 2026-10-13).
- El link sirve una vez y vence a los 7 días si no se usa. Un link vencido se puede reactivar por 3 días más desde el panel.
- Horarios cada 30 minutos (opción B). Se entrega en dos partes:
  1. **Motor en medias horas, sin cambios visibles:** cada reserva guarda su duración (`duracion_min`) y su fin (`fin_utc`); la base impide cruces de horario (misma nutricionista, o dos presenciales en el único consultorio), no solo inicios iguales; el motor de horas libres acepta `duracionMin` y `pasoMin`. La web de pago sigue ofreciendo 1 hora en punto.
  2. **Links de agenda:** panel del equipo y página del paciente.
- Los links comparten el motor y los candados con la reserva con pago: una hora tomada por un lado deja de ofrecerse por el otro.
- Citas de link no cuentan para el tope de primeras sesiones (peso 0) y no aparecen en «Pagaron» del panel.
- Flujo del paciente: horario → DNI → (si ya es paciente) confirmar con correo y WhatsApp enmascarados, o «Mis datos cambiaron» → formulario; (si es nuevo) formulario con Apellidos (paterno y materno), Nombres, Correo, WhatsApp, Fecha de nacimiento y aceptación de condiciones y privacidad → listo (Google Calendar y .ics) · pantallas de link usado y link vencido.
- DNI después del horario: menos abandono y no muestra el nombre a quien reciba el link reenviado. Solo DNI peruano (8 dígitos).
- «Ya es paciente» = existe un cliente con ese DNI y una reserva confirmada o pagada. Al inicio casi nadie lo será (pagaron fuera de la web); desde su segundo link sí.
- Consultas de DNI limitadas a 10 por link (evita usar un link para averiguar datos de otros).
- Panel `/panel/links/` con el mismo acceso por código del panel actual: tarjetas de evento con «Crear link de un solo uso» (Copiar, Enviar por WhatsApp), tabla de links con buscador, periodo (por defecto 30 días), filtro por estado (Todos, Sin usar, Agendados, Vencidos), paginación de 20 y «Reactivar 3 días más»; tabla Agendados con Próximas/Pasadas, buscador, periodo, paginación, casillas con «Todos» y «Descargar N para Google Sheets (.csv)».
- Los vencidos viejos se «archivan» solos: el periodo por defecto filtra por la última actividad del link (creación o reactivación).
- El token del link se guarda como hash; la URL solo se ve al crearlo.
- Página del paciente y panel sin analítica (el token va en la URL y hay datos personales).

## Fuera del MVP

Editar tipos de evento, cancelar o mover citas desde el panel, sincronizar con Google Sheets en vivo, CE o pasaporte en el paso de DNI, aviso al equipo por correo de cada cita agendada (el evento ya cae en el calendario).

## Abierto

- La política de privacidad nombra la reserva web; revisar con Joaquín si cubre el agendamiento por link antes de publicar la entrega 2.
