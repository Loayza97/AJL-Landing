// Cambios hechos a mano en Google Calendar → base (spec 2026-10-19-sincronizar-calendario).
// compararEvento es pura; sincronizarCalendario pide a Google lo modificado desde
// el cursor, aplica o marca, y avanza el cursor solo si Google respondió bien.
// La disparan el cron cada 10 min (/api/reservas/sincronizar-calendario) y el panel.
import * as repo from './repo.mjs';
import { fechaLima } from './tiempo.mjs';

export const CURSOR = 'calendario_cursor';
const MIN = 60 * 1000;
const SOLAPE_MS = 2 * MIN;
const PRIMERA_VEZ_MS = 30 * 24 * 60 * MIN;
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

export async function sincronizarCalendario(deps, { minIntervaloMs = 0 } = {}) {
  const ahora = deps.ahora();
  const ultima = await repo.leerSync(deps.db, CURSOR);
  if (minIntervaloMs && ultima && ahora.getTime() - Date.parse(ultima) < minIntervaloMs) return { omitida: true };
  const desde = new Date(ultima ? Date.parse(ultima) - SOLAPE_MS : ahora.getTime() - PRIMERA_VEZ_MS).toISOString();
  const cambios = await deps.google.listarCambios(desde); // si falla, lanza y el cursor no avanza
  const res = { aplicados: 0, revisar: 0, fallidos: [] };
  for (const c of cambios) {
    // Sin id de reserva y no borrado: evento del equipo, no nuestro.
    if (!c.borrado && !c.reservaId) continue;
    try {
      const r = await repo.reservaPorEvento(deps.db, { eventoId: c.id, reservaId: c.reservaId });
      const d = compararEvento(r, c);
      if (d.accion === 'revisar') {
        await repo.marcarRevisar(deps.db, { id: r.id, motivo: d.motivo, cambios: null, ahora });
        res.revisar++;
      } else if (d.accion === 'quitarBorrado') {
        await repo.quitarBorrado(deps.db, r.id);
      } else if (d.accion === 'aplicar') {
        const n = d.nuevo;
        const ocupada = await repo.hayCruce(deps.db, { id: r.id, nutri: r.nutricionista_id, inicio: n.inicio, modalidad: n.modalidad, fin: n.fin });
        const hecho = ocupada ? { ok: false, motivo: 'cruce' }
          : await repo.aplicarCambioCalendario(deps.db, { id: r.id, ...n, cambios: d.texto, ahora });
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
  await repo.guardarSync(deps.db, CURSOR, ahora.toISOString());
  return res;
}
