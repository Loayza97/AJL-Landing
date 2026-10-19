// Cambios hechos a mano en Google Calendar → base (spec 2026-10-19-sincronizar-calendario).
// compararEvento es pura; sincronizarCalendario pide a Google lo modificado desde
// el cursor, aplica o marca, y avanza el cursor solo si Google respondió bien.
// La disparan el cron cada 10 min (/api/reservas/sincronizar-calendario) y el panel.
import * as repo from './repo.mjs';
import { fechaLima } from './tiempo.mjs';
import { correoEquipoAlerta } from './correos.mjs';

export const CURSOR = 'calendario_cursor';
const MIN = 60 * 1000;
const SOLAPE_MS = 2 * MIN;
const PRIMERA_VEZ_MS = 30 * 24 * 60 * MIN;
// Tope de eventos que escriben en la base por corrida: D1 (plan gratis) limita las
// consultas por invocación. Si hay más, se atienden los primeros y el cursor no avanza.
export const MAX_CAMBIOS_POR_CORRIDA = 15;
const MOD = { presencial: 'presencial', video: 'virtual' };

// Lima es UTC-5 todo el año (sin horario de verano).
const horaLima = (iso) => new Date(Date.parse(iso) - 5 * 60 * MIN).toISOString().slice(11, 16).replace(/^0/, '');
const diaMes = (iso) => fechaLima(new Date(iso)).split('-').reverse().slice(0, 2).join('/');
const finDe = (r) => r.fin_utc ?? new Date(Date.parse(r.inicio_utc) + (r.duracion_min ?? 60) * MIN).toISOString().replace('.000Z', 'Z');

export function textoCambios(r, nuevo) {
  const partes = [];
  if (nuevo.inicio !== r.inicio_utc) {
    partes.push(nuevo.fecha === r.fecha_lima
      ? `${horaLima(r.inicio_utc)} → ${horaLima(nuevo.inicio)}`
      : `${diaMes(r.inicio_utc)} ${horaLima(r.inicio_utc)} → ${diaMes(nuevo.inicio)} ${horaLima(nuevo.inicio)}`);
  }
  const antes = r.duracion_min ?? 60;
  if (nuevo.duracion !== antes) partes.push(`${antes} → ${nuevo.duracion} min`);
  if (nuevo.modalidad !== r.modalidad) partes.push(`${MOD[r.modalidad]} → ${MOD[nuevo.modalidad]}`);
  return partes.join(' · ');
}

export function compararEvento(r, c) {
  if (!r || r.estado !== 'confirmada') return { accion: 'ignorar' };
  if (c.borrado) return r.calendario_revisar === 'borrado' ? { accion: 'ignorar' } : { accion: 'revisar', motivo: 'borrado' };
  if (!c.inicio || !c.fin) return { accion: 'ignorar' }; // de día completo: no es una cita
  const modalidad = c.meet ? 'video' : c.ubicacion ? 'presencial' : r.modalidad;
  const nuevo = { inicio: c.inicio, fin: c.fin, duracion: Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / MIN),
    fecha: fechaLima(new Date(c.inicio)), modalidad };
  const igual = nuevo.inicio === r.inicio_utc && nuevo.fin === finDe(r) && nuevo.modalidad === r.modalidad;
  if (igual) return r.calendario_revisar === 'borrado' ? { accion: 'quitarBorrado' } : { accion: 'ignorar' };
  return { accion: 'aplicar', nuevo, texto: textoCambios(r, nuevo) };
}

// Avisa al equipo de los eventos que no se pudieron pasar a la base. Lo usan el cron
// y el panel; un fallo del correo no debe tumbar una sincronización que salió bien.
export async function alertarFallidos(deps, env, fallidos) {
  if (!fallidos?.length) return;
  try {
    await deps.sendEmail({
      from: env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>', to: env.NOTIFICATION_EMAIL,
      ...correoEquipoAlerta({ asunto: 'Calendario sin sincronizar',
        detalle: `No se pudieron pasar a la base ${fallidos.length} cambios del calendario (eventos ${fallidos.join(', ')}). Revisa esas citas en el panel.` }),
    });
  } catch (e) {
    console.error('sincronizar/alerta', e);
  }
}

export async function sincronizarCalendario(deps, { minIntervaloMs = 0, timeoutMs } = {}) {
  const ahora = deps.ahora();
  const ultima = await repo.leerSync(deps.db, CURSOR);
  if (minIntervaloMs && ultima && ahora.getTime() - Date.parse(ultima) < minIntervaloMs) return { omitida: true };
  const desde = new Date(ultima ? Date.parse(ultima) - SOLAPE_MS : ahora.getTime() - PRIMERA_VEZ_MS).toISOString();
  const cambios = await deps.google.listarCambios(desde, timeoutMs ? { timeoutMs } : undefined); // si falla, lanza y el cursor no avanza
  // Sin id de reserva y no borrado: evento del equipo, no nuestro.
  const propios = cambios.filter((c) => c.borrado || c.reservaId);
  const res = { aplicados: 0, revisar: 0, fallidos: [] };
  // Una sola consulta para todos los candidatos; el cruce con cada evento se hace aquí.
  let filas = [];
  if (propios.length) {
    filas = await repo.reservasPorEventos(deps.db, {
      eventoIds: propios.map((c) => c.id), reservaIds: propios.map((c) => c.reservaId).filter(Boolean) });
  }
  const porEvento = new Map(filas.filter((f) => f.google_event_id).map((f) => [f.google_event_id, f]));
  const porId = new Map(filas.map((f) => [f.id, f]));
  let escrituras = 0;
  let pendientes = false;
  for (const c of propios) {
    let r = porEvento.get(c.id) ?? (c.reservaId ? porId.get(c.reservaId) : undefined) ?? null;
    // Evento repetido con el mismo id privado: la reserva ya es de otro evento.
    if (r && r.google_event_id && r.google_event_id !== c.id) continue;
    const d = compararEvento(r, c);
    if (d.accion === 'ignorar') continue;
    if (escrituras >= MAX_CAMBIOS_POR_CORRIDA) { pendientes = true; break; }
    escrituras++;
    try {
      if (d.accion === 'revisar') {
        await repo.marcarRevisar(deps.db, { id: r.id, motivo: d.motivo, cambios: null, ahora });
        res.revisar++;
      } else if (d.accion === 'quitarBorrado') {
        await repo.quitarBorrado(deps.db, r.id);
      } else if (d.accion === 'aplicar') {
        const hecho = await repo.aplicarCambioCalendario(deps.db, { id: r.id, ...d.nuevo, cambios: d.texto, ahora });
        if (hecho.ok) res.aplicados++;
        else if (hecho.motivo === 'cruce') {
          await repo.marcarRevisar(deps.db, { id: r.id, motivo: 'cruce', cambios: d.texto, ahora });
          res.revisar++;
        }
      }
    } catch (e) {
      console.error('sincronizar evento', c.id, e);
      res.fallidos.push(c.id);
    }
  }
  // Con trabajo pendiente el cursor se queda: la próxima corrida repite la ventana
  // (lo ya aplicado queda en «ignorar») y avanza por los que faltan.
  if (pendientes) return { ...res, pendientes: true };
  await repo.guardarSync(deps.db, CURSOR, ahora.toISOString());
  return res;
}
