# Sincronizar Google Calendar → base y panel · diseño

Fecha: 2026-10-19 · Pedido de Joaquín y Alejandro · Rama `reservas-pago`

## Problema

El sistema crea un evento en el calendario «AlejandroJLoayza Nutrición» por cada cita (web y link). Si alguien del equipo edita ese evento a mano (hora, duración, presencial/virtual) o lo borra, la base D1 y el panel no se enteran. Caso real: la cita de Cecilia Chau (reserva `cc0cab0f…`) se agendó el 21-oct a las 10:00, presencial; en el calendario la movieron a las 9:00, virtual. El panel siguió diciendo 10:00 presencial y la web siguió bloqueando a Jussara de 10:00 a 10:30.

## Objetivo

Que la base refleje los cambios manuales del calendario en 10 minutos como máximo (o al abrir el panel), y que el equipo vea en el panel qué citas se tocaron a mano.

Éxito: al mover un evento en Google Calendar, a los 10 minutos (o al recargar el panel) la reserva tiene la hora y la modalidad nuevas, la web ofrece la hora vieja y bloquea la nueva, y el panel muestra la marca «Editada en calendario».

## Decisiones tomadas (2026-10-19)

- Revisión periódica cada 10 min, más una revisión al abrir el panel. Sin avisos en vivo de Google (`events.watch`) por ahora.
- Evento borrado en Google: la reserva NO se cancela sola. Se marca para revisar y el equipo decide.
- Título, descripción y nutricionista del evento no se leen: no son datos confiables.

## Cómo corre

1. El Worker `ajl-resumen-cron` suma un segundo cron, `*/10 * * * *`. El handler `scheduled` mira `evento.cron`: el de las 13:00 UTC dispara el resumen como hoy; el de cada 10 min hace POST a `SYNC_URL` (`https://www.ajlnutricion.com/api/reservas/sincronizar-calendario`) con `Authorization: Bearer RESUMEN_TOKEN`. Mismo secreto, sin secreto nuevo.
2. Ruta nueva `functions/api/reservas/sincronizar-calendario.js` → `handleSincronizarCalendario` en `server/handlers/`. Rechaza sin el token (401).
3. El panel: `/api/equipo/agendados` llama a la misma sincronización antes de leer, salvo que la última haya corrido hace menos de 60 s. Si la sincronización falla, el panel carga igual con lo que hay (se registra el error).

## Qué pide a Google

- `events.list` del calendario con `updatedMin` = última revisión menos 2 minutos de solape, `singleEvents=true`, `showDeleted=true`, paginado. Con `updatedMin`, Google incluye los borrados.
- Se quedan solo los eventos con `extendedProperties.private.ajl_reserva_id` (los que creó el sistema; Google lo conserva aunque editen el evento).
- La primera vez (sin cursor guardado) usa `updatedMin` = ahora menos 30 días.
- El cursor se guarda solo si la revisión terminó bien; si falla, la siguiente repite la ventana. Todo es idempotente: procesar dos veces el mismo evento no cambia nada.
- Nueva función `listarCambios(desdeIso)` en `server/reservas/google.mjs`, aparte de `listarEventos` (que filtra cancelados y tiene caché de 60 s; esta no usa caché).

## Qué compara y qué hace

Para cada evento con id de reserva, se busca la reserva. Si no existe o no está `confirmada`, se ignora.

| Cambio en Google | Acción en la base |
|---|---|
| `start`/`end` distintos de `inicio_utc`/`fin_utc` | Actualiza `inicio_utc`, `fin_utc`, `duracion_min` y `fecha_lima` |
| Tiene Meet (`hangoutLink` o `conferenceData`) y la reserva es presencial | `modalidad = 'video'` |
| No tiene Meet, tiene `location`, y la reserva es virtual | `modalidad = 'presencial'` |
| Ni Meet ni ubicación | No toca la modalidad |
| `status = 'cancelled'` (borrado) | No cambia el estado; `calendario_revisar = 'borrado'` |
| Evento borrado que vuelve a existir (deshacer en Google) | Quita la marca `borrado` si la tenía |
| La hora o modalidad nueva choca con otra reserva activa (índices únicos o `hayCruce`) | No mueve nada; `calendario_revisar = 'cruce'` y guarda en `calendario_cambios` lo que intentó |

Cada vez que aplica un cambio, escribe `calendario_editado_en` (ahora) y `calendario_cambios`, un texto corto legible, por ejemplo `10:00 → 9:00 · presencial → virtual`. La hora nueva se acepta aunque esté fuera del horario de la nutricionista: es una decisión del equipo.

La lógica de comparación es una función pura (`compararEvento(reserva, evento)` → cambios o marca) en `server/reservas/sincronizar.mjs`, probada sin red ni base.

## Panel

- En Reservas, si `calendario_editado_en` existe, la fila lleva la marca «Editada en calendario: <cambios> · <fecha>».
- Si `calendario_revisar` tiene valor, la fila se resalta con «Evento borrado, revisar» o «Movida a una hora ocupada, revisar», y dos botones:
  - **Cancelar reserva**: `estado = 'cancelada'` (libera la hora) y limpia la marca.
  - **Mantener**: limpia la marca; la reserva queda como está.
- Ruta nueva `POST /api/equipo/revision` `{ id, accion: 'cancelar' | 'mantener' }`, con la misma sesión del panel que el resto de `/api/equipo/*`.
- Las columnas nuevas no entran en el CSV ni en «Copiar para la base maestra».

## Datos

Migración `db/d1/0012_sincronizar_calendario.sql` (solo agrega):

```sql
ALTER TABLE reservas ADD COLUMN calendario_editado_en TEXT;
ALTER TABLE reservas ADD COLUMN calendario_cambios TEXT;
ALTER TABLE reservas ADD COLUMN calendario_revisar TEXT CHECK (calendario_revisar IN ('borrado', 'cruce'));
CREATE TABLE sync_estado (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
```

`sync_estado` guarda `calendario_cursor` (ISO de la última revisión que terminó bien).

Orden de publicación: 0012 en preview (`--env preview`), luego en `ajl-reservas` ANTES del merge a `main`; después desplegar el Worker con el cron nuevo.

## Errores

- Google falla o el token vence: la ruta responde 503, no mueve el cursor y lo registra. La siguiente revisión reintenta.
- Un evento falla al aplicarse: se registra y se sigue con los demás; el cursor avanza igual (ese evento quedaría sin sincronizar hasta que lo vuelvan a editar). Se manda alerta al equipo con `correoEquipoAlerta` solo en este caso.

## Pruebas

- `compararEvento`: mover hora, cambiar duración, presencial→virtual, virtual→presencial, sin Meet ni ubicación, borrado, deshacer borrado, reserva no confirmada, sin cambios.
- Handler con Google y D1 de prueba: aplica cambios, marca cruce sin mover, idempotente al repetir, cursor no avanza si Google falla, 401 sin token.
- Panel: `/api/equipo/revision` cancelar y mantener; `/api/equipo/agendados` devuelve las columnas nuevas y no sincroniza dos veces en 60 s.
- Worker: el cron de 10 min llama a `SYNC_URL`, el diario al resumen.
- Prueba real en preview: crear una cita, moverla a mano en Google Calendar, recargar el panel y verla actualizada; borrar el evento y ver la marca. Borrar luego la cita de prueba.

## Fuera de alcance

- Avisos en vivo de Google (`events.watch`).
- Detectar cambio de nutricionista o leer título y descripción.
- Recrear el evento al elegir «Mantener» en uno borrado.
- Avisar al paciente de un cambio (lo hace Google si quien edita elige notificar).
- Eventos creados a mano por el equipo (sin id de reserva): siguen bloqueando horas como hoy.

## Pendiente de decidir

- Al cancelar desde el panel, la limpieza de datos de 30 días (`purgarNoPagadas` en `server/reservas/repo.mjs`) borra la ficha del paciente si no tiene otra reserva confirmada. Para un paciente que ya atendimos puede no convenir. Propuesta: dejarlo como está en esta entrega y revisarlo aparte.
