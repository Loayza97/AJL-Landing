# Editar cita desde el panel · diseño

Fecha: 2026-10-22 · Pedido de Joaquín y Alejandro · Rama `reservas-pago`

## Problema

Desde el 22-oct la web y los links cierran el día al llegar al tope (300 minutos L-V, 480 sábado). El equipo necesita reprogramar citas, o mover una a un día lleno, sin poner eventos a mano en Google Calendar (ya no se agenda a mano) y sin que el panel quede desfasado del calendario.

## Objetivo

Un botón «Editar» en cada cita del panel que cambia fecha, hora, nutricionista y modalidad, guarda el cambio en la base y actualiza el mismo evento de Google Calendar.

Éxito: Romi edita una cita de Jussara presencial el jueves 10:00 a Nico virtual el viernes 15:00, aunque el viernes esté lleno; la fila del panel muestra la cita nueva y la marca de edición, el evento de Google tiene la hora, el título y el Meet nuevos, y al paciente le llega el aviso de actualización de Google.

## Decisiones (2026-10-22)

- Se edita: fecha, hora, nutricionista y modalidad. La duración no.
- Horas elegibles: solo donde esa nutricionista atiende y está libre, con las reglas de la web (su ventana, horario del consultorio si es presencial, almuerzo, ausencias de día completo, eventos manuales con hora, sin cruces con otra cita suya ni con otra presencial), **sin tope diario**. Desde ahora hasta 60 días adelante.
- Aviso al paciente: solo el de Google Calendar (`sendUpdates=all`). Sin correo propio (Joaquín: «parece un overkill»).
- Puede editar cualquiera con acceso al panel. Queda registrado quién y cuándo.
- Se editan solo citas `confirmada` cuya hora no pasó, de la web o de links. No las `pagada_sin_hora` ni las canceladas.
- El evento de Google se edita (PATCH), no se borra y recrea: un solo aviso al paciente y el Meet se conserva si sigue virtual.

## Panel

- En Reservas, cada fila que cumple las condiciones tiene el botón «Editar».
- Abre un cuadro con: nutricionista (select, viene la actual), modalidad (presencial/virtual), fecha (calendario), y la lista de horas libres que devuelve el servidor para esa combinación. Botones «Guardar cambio» y «Cancelar».
- La hora actual de la propia cita cuenta como libre (se excluye a sí misma del cruce).
- Al guardar, la fila se recarga. Si alguien tomó la hora mientras tanto: «Esa hora acaba de ocuparse. Elige otra.».
- La fila editada muestra «Editada por romi@… · 22-oct: 10:00 → 9:00 · presencial → virtual · Jussara → Nico» (solo lo que cambió; fecha si cambió el día).
- No entra en el CSV ni en «Copiar para la base maestra», que ya leen los datos actuales de la cita.

## Servidor

- `GET /api/equipo/editar-horas?id=&fecha=&modalidad=&nutricionista=` → `{ ok, horas: [{ inicio, hora }] }`. Usa `horasLibres` con `filtroNutricionista`, `desdeDias: 0`, `hastaDias: 60`, la duración de la reserva, paso de 30 si dura 30 y de 60 si dura 60, y una opción nueva `sinTope: true`. Las reservas pasadas al motor excluyen la propia cita.
- `POST /api/equipo/editar` `{ id, inicio, modalidad, nutricionista }`:
  1. Acceso del panel (401 si no).
  2. Valida datos (400) y que la reserva sea `confirmada` y futura (409 «Esta cita ya no se puede editar.»).
  3. Recalcula con el motor que la hora siga libre (409 ocupada).
  4. Un solo `UPDATE` con `NOT CRUCE(...)` excluyendo la propia cita, sin condición de tope: `inicio_utc`, `fin_utc` (misma duración), `fecha_lima`, `modalidad`, `nutricionista_id`, `editada_en`, `editada_por`, `edicion_cambios`, `actualizado_en`. Índice único violado o cruce → 409 ocupada.
  5. Google: `actualizarEvento` (nuevo en `server/reservas/google.mjs`): PATCH a `events/{google_event_id}?conferenceDataVersion=1&sendUpdates=all` con start/end, `summary` y `description` de `eventoEquipo` (nutricionista nueva), y modalidad: a virtual `conferenceData.createRequest` y `location: null`; a presencial `location` = dirección y `conferenceData: null`. Guarda `meet_url` nuevo (o null en presencial).
  6. Sin `google_event_id`, o Google responde 404/410: crea el evento con `crearEvento` y guarda su id.
  7. Google falla por otra causa: la cita queda editada, `calendario_pendiente = 1` y alerta al equipo con `correoEquipoAlerta`. Respuesta 200 con `{ ok: true, calendario: 'pendiente' }`; el panel avisa «Cita cambiada; el calendario no se pudo actualizar, revisar a mano».
- El tope diario no se mira en ningún paso: la web y los links siguen viendo el día con los minutos reales, incluida la cita movida.

## Datos

Migración `db/d1/0015_editar_cita.sql` (solo agrega):

```sql
ALTER TABLE reservas ADD COLUMN editada_en TEXT;
ALTER TABLE reservas ADD COLUMN editada_por TEXT;
ALTER TABLE reservas ADD COLUMN edicion_cambios TEXT;
```

`edicion_cambios` guarda el texto de la última edición. `/api/equipo/agendados` los devuelve. Orden de publicación: 0015 en preview y luego en `ajl-reservas` antes del merge. Si se publica antes que el neto (0014), se aplican las dos migraciones o se renumera.

## Pruebas

- Motor: `sinTope` ofrece horas en un día lleno; sin él, no.
- `editar-horas`: excluye la propia cita, respeta ventana y cruces, 401 sin acceso.
- `editar`: cambia hora y nutricionista; rechaza cruce con otra cita de la nutricionista y con otra presencial; entra en un día lleno; 409 en cita pasada, cancelada o `pagada_sin_hora`; guarda quién y el texto del cambio.
- Google: PATCH con start/end y título nuevos; a virtual pide Meet y quita ubicación; a presencial pone dirección y quita Meet; sin evento o 404 crea uno; caída → `calendario_pendiente` y alerta, la cita igual cambia.
- Prueba real en preview: editar una cita de prueba y verla movida en Google Calendar, luego cancelarla y borrar el evento.

## Fuera de alcance

- Cambiar la duración, cancelar desde el botón (ya existe en revisión), editar `pagada_sin_hora`.
- Correo propio al paciente.
- Horas fuera del horario de la nutricionista.
- Historial de varias ediciones (se guarda la última).
